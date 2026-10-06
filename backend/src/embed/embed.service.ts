import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";
import * as crypto from "crypto";
import { EmbedView } from "./entities/embed-view.entity";
import { Track } from "../tracks/entities/track.entity";

const EMBED_SECRET = process.env.EMBED_SECRET || "embed-secret-key";
const DEFAULT_TOKEN_TTL_SECONDS = 15 * 60;
const DOMAIN_VIEW_LIMIT = 1000;

type EmbedTokenPayload = {
  trackId: string;
  exp: number;
};

@Injectable()
export class EmbedService {
  private readonly logger = new Logger(EmbedService.name);

  constructor(
    @InjectRepository(EmbedView)
    private readonly embedViewRepo: Repository<EmbedView>,
    @InjectRepository(Track)
    private readonly trackRepo: Repository<Track>,
  ) {}

  generateEmbedToken(
    trackId: string,
    ttlSeconds: number = DEFAULT_TOKEN_TTL_SECONDS,
  ): string {
    const payload: EmbedTokenPayload = {
      trackId,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    const signature = crypto
      .createHmac("sha256", EMBED_SECRET)
      .update(encodedPayload)
      .digest("hex");

    return `${encodedPayload}.${signature}`;
  }

  validateEmbedToken(trackId: string, token: string): boolean {
    const payload = this.decodeToken(token);
    if (!payload) {
      return false;
    }

    return (
      payload.trackId === trackId && payload.exp > Math.floor(Date.now() / 1000)
    );
  }

  async getOEmbed(trackId: string, baseUrl: string) {
    const track = await this.getTrackOrFail(trackId);
    this.assertEmbeddable(track);

    return {
      version: "1.0",
      type: "rich",
      title: track.title,
      author_name: track.artist?.artistName || "Unknown Artist",
      author_url: `${baseUrl}/artists/${track.artistId}`,
      provider_name: "VibePay",
      provider_url: baseUrl,
      thumbnail_url: track.coverArtUrl || null,
      thumbnail_width: 300,
      thumbnail_height: 300,
      html: `<iframe src="${baseUrl}/embed/${trackId}" width="100%" height="120" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>`,
      width: "100%",
      height: 120,
    };
  }

  async getMetaTags(trackId: string, baseUrl: string) {
    const track = await this.getTrackOrFail(trackId);
    this.assertEmbeddable(track);

    const trackUrl = `${baseUrl}/tracks/${trackId}`;
    const embedUrl = `${baseUrl}/embed/${trackId}`;
    const image = track.coverArtUrl || `${baseUrl}/default-cover.png`;
    const description =
      track.description || `Listen to ${track.title} on VibePay`;

    return {
      openGraph: {
        "og:type": "music.song",
        "og:title": track.title,
        "og:description": description,
        "og:url": trackUrl,
        "og:image": image,
        "og:audio": track.audioUrl,
        "og:audio:type": track.mimeType || "audio/mpeg",
        "og:site_name": "VibePay",
        "music:musician": track.artist?.artistName || "Unknown Artist",
      },
      twitterCard: {
        "twitter:card": "player",
        "twitter:title": track.title,
        "twitter:description": description,
        "twitter:image": image,
        "twitter:player": embedUrl,
        "twitter:player:width": "480",
        "twitter:player:height": "120",
      },
    };
  }

  async getPlayerData(trackId: string, token: string) {
    if (!this.validateEmbedToken(trackId, token)) {
      throw new ForbiddenException("Invalid or expired embed token");
    }

    const track = await this.getTrackOrFail(trackId);
    this.assertEmbeddable(track);

    return {
      trackId: track.id,
      title: track.title,
      artist: track.artist?.artistName || null,
      artistId: track.artistId,
      audioUrl: track.streamingUrl || track.audioUrl,
      coverArtUrl: track.coverArtUrl || null,
      duration: track.duration,
      genre: track.genre || null,
    };
  }

  async recordView(
    trackId: string,
    referrer: string | null,
    origin: string | null,
  ): Promise<void> {
    const track = await this.getTrackOrFail(trackId);
    this.assertEmbeddable(track);

    const referrerDomain = this.extractDomain(referrer);
    const originDomain = this.extractDomain(origin);
    const activeDomain = originDomain || referrerDomain;

    if (activeDomain) {
      await this.enforceDomainRateLimit(activeDomain);
    }

    await this.embedViewRepo.save(
      this.embedViewRepo.create({ trackId, referrerDomain }),
    );
  }

  async getAnalytics(trackId: string) {
    const total = await this.embedViewRepo.count({ where: { trackId } });

    const byDomain = await this.embedViewRepo
      .createQueryBuilder("v")
      .where("v.trackId = :trackId", { trackId })
      .select(["v.referrerDomain AS domain", "COUNT(v.id) AS views"])
      .groupBy("v.referrerDomain")
      .orderBy("views", "DESC")
      .limit(20)
      .getRawMany();

    const last30Days = await this.embedViewRepo
      .createQueryBuilder("v")
      .where("v.trackId = :trackId", { trackId })
      .andWhere(`v.viewedAt >= NOW() - INTERVAL '30 days'`)
      .select([`DATE_TRUNC('day', v.viewedAt) AS day`, "COUNT(v.id) AS views"])
      .groupBy("day")
      .orderBy("day", "ASC")
      .getRawMany();

    return { total, byDomain, last30Days };
  }

  private async getTrackOrFail(trackId: string) {
    const track = await this.trackRepo.findOne({
      where: { id: trackId },
      relations: ["artist"],
    });

    if (!track) {
      throw new NotFoundException("Track not found");
    }

    return track;
  }

  private assertEmbeddable(track: Track): void {
    if (!track.isPublic) {
      throw new ForbiddenException("Embed is only available for public tracks");
    }
  }

  private decodeToken(token: string): EmbedTokenPayload | null {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = crypto
      .createHmac("sha256", EMBED_SECRET)
      .update(encodedPayload)
      .digest("hex");

    const provided = Buffer.from(signature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");

    if (
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(provided, expected)
    ) {
      return null;
    }

    try {
      return JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8"),
      ) as EmbedTokenPayload;
    } catch (error) {
      this.logger.warn(`Failed to decode embed token: ${error}`);
      return null;
    }
  }

  private extractDomain(url: string | null): string | null {
    if (!url) {
      return null;
    }

    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  private async enforceDomainRateLimit(domain: string): Promise<void> {
    const recentCount = await this.embedViewRepo.count({
      where: {
        referrerDomain: domain,
        viewedAt: MoreThan(new Date(Date.now() - 60 * 60 * 1000)),
      },
    });

    if (recentCount >= DOMAIN_VIEW_LIMIT) {
      throw new ForbiddenException("Rate limit exceeded for this domain");
    }
  }
}
