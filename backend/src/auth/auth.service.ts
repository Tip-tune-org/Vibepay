import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import * as StellarSdk from "@stellar/stellar-sdk";
import { User } from "../users/entities/user.entity";
import { UsersService } from "../users/users.service";
import { AuthRedisService } from "./services/auth-redis.service";
import { VerifySignatureDto } from "./dto/verify-signature.dto";
import { ChallengeResponseDto } from "./dto/challenge.dto";
import { AuthResponseDto } from "./dto/auth-response.dto";

interface Challenge {
  challengeId: string;
  challenge: string;
  publicKey: string;
  expiresAt: Date;
}

interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private readonly challengeExpirationMinutes = 5;
  private readonly accessTokenExpiration = "15m";
  private readonly refreshTokenExpiration = "7d";
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly authRedisService: AuthRedisService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Generate a challenge message for wallet signing
   */
  async generateChallenge(publicKey: string): Promise<ChallengeResponseDto> {
    // Validate Stellar public key format
    if (!this.isValidStellarPublicKey(publicKey)) {
      throw new BadRequestException("Invalid Stellar public key format");
    }

    const challengeId = uuidv4();
    const timestamp = Date.now();
    const challenge = `Sign this message to authenticate with VibePay:\n\nChallenge ID: ${challengeId}\nTimestamp: ${timestamp}\nPublic Key: ${publicKey}`;

    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + this.challengeExpirationMinutes,
    );

    const challengeData: Challenge = {
      challengeId,
      challenge,
      publicKey,
      expiresAt,
    };

    await this.authRedisService.setChallenge(challengeData);

    this.logger.debug(
      `Generated challenge for public key: ${publicKey.substring(0, 8)}...`,
    );

    return {
      challengeId,
      challenge,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Verify signed challenge and issue JWT tokens
   */
  async verifySignature(
    verifyDto: VerifySignatureDto,
  ): Promise<AuthResponseDto> {
    const { challengeId, publicKey, signature } = verifyDto;

    // Retrieve challenge
    const challenge = await this.authRedisService.getChallenge(challengeId);
    if (!challenge) {
      throw new UnauthorizedException("Invalid or expired challenge");
    }

    // Check expiration
    if (new Date() > new Date(challenge.expiresAt)) {
      await this.authRedisService.deleteChallenge(challengeId);
      throw new UnauthorizedException("Challenge has expired");
    }

    // Verify public key matches challenge
    if (challenge.publicKey !== publicKey) {
      throw new UnauthorizedException("Public key does not match challenge");
    }

    // Verify signature using Stellar SDK
    const isValid = await this.verifyStellarSignature(
      challenge.challenge,
      publicKey,
      signature,
    );

    if (!isValid) {
      throw new UnauthorizedException("Invalid signature");
    }

    // Remove used challenge
    await this.authRedisService.deleteChallenge(challengeId);

    // Get or create user
    let user = await this.userRepository.findOne({
      where: { walletAddress: publicKey },
    });

    if (!user) {
      // Create new user with wallet address
      user = this.userRepository.create({
        walletAddress: publicKey,
        username: `user_${publicKey.substring(0, 8)}`,
        email: `${publicKey.substring(0, 8)}@wallet.local`,
        isArtist: false,
      });
      user = await this.userRepository.save(user);
      this.logger.log(`Created new user: ${user.id}`);
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    this.logger.log(
      `User authenticated: ${user.id} (${publicKey.substring(0, 8)}...)`,
    );

    return {
      ...tokens,
      user,
    };
  }

  /**
   * Verify Stellar signature
   * Note: This verifies Ed25519 signatures. Wallet signatures from Freighter
   * may need additional processing depending on the signature format returned.
   */
  private async verifyStellarSignature(
    message: string,
    publicKey: string,
    signature: string,
  ): Promise<boolean> {
    try {
      // Decode base64 signature
      let signatureBuffer: Buffer;
      try {
        signatureBuffer = Buffer.from(signature, "base64");
      } catch {
        // If base64 decode fails, try hex
        signatureBuffer = Buffer.from(signature, "hex");
      }

      // Verify signature using Stellar SDK
      const keypair = StellarSdk.Keypair.fromPublicKey(publicKey);
      const messageBuffer = Buffer.from(message, "utf8");

      // Stellar uses Ed25519 signatures
      // The verify method checks if the signature is valid for the message
      return keypair.verify(messageBuffer, signatureBuffer);
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate JWT access and refresh tokens
   */
  private async generateTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = {
      sub: user.id,
      walletAddress: user.walletAddress,
      isArtist: user.isArtist,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.accessTokenExpiration,
    });

    const refreshTokenId = uuidv4();
    const refreshToken = this.jwtService.sign(
      { sub: user.id, tokenId: refreshTokenId },
      {
        expiresIn: this.refreshTokenExpiration,
      },
    );

    // Store refresh token
    await this.authRedisService.setRefreshToken({
      userId: user.id,
      tokenId: refreshTokenId,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken);

      if (!payload.tokenId || !payload.userId) {
        throw new UnauthorizedException("Invalid refresh token");
      }

      // Verify token exists in our store
      const isValidToken = await this.authRedisService.validateRefreshToken(
        payload.tokenId,
        payload.userId,
      );
      if (!isValidToken) {
        throw new UnauthorizedException("Refresh token not found or invalid");
      }

      // Get user
      const user = await this.userRepository.findOne({
        where: { id: payload.userId },
      });

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      // Generate new access token
      const accessTokenPayload = {
        sub: user.id,
        walletAddress: user.walletAddress,
        isArtist: user.isArtist,
      };

      const accessToken = this.jwtService.sign(accessTokenPayload, {
        expiresIn: this.accessTokenExpiration,
      });

      this.logger.debug(`Refreshed access token for user: ${user.id}`);

      return { accessToken };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Token refresh failed: ${error.message}`);
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  /**
   * Verify access token for WebSocket connections
   */
  async verifyAccessToken(token: string): Promise<User> {
    try {
      const payload = this.jwtService.verify(token);
      return this.getCurrentUser(payload.sub);
    } catch (error) {
      throw new UnauthorizedException("Invalid access token");
    }
  }

  /**
   * Logout - invalidate refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken);
      if (payload.tokenId) {
        await this.authRedisService.deleteRefreshToken(payload.tokenId);
        this.logger.debug(`Invalidated refresh token: ${payload.tokenId}`);
      }
    } catch (error) {
      // Token might already be invalid, ignore
      this.logger.debug(`Logout: token already invalid or expired`);
    }
  }

  /**
   * Get current user from JWT payload
   */
  async getCurrentUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return user;
  }

  /**
   * Validate Stellar public key format
   */
  private isValidStellarPublicKey(publicKey: string): boolean {
    try {
      StellarSdk.Keypair.fromPublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize module and start cleanup timer
   */
  async onModuleInit(): Promise<void> {
    // Clean up expired challenges every 10 minutes
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredChallenges(),
      10 * 60 * 1000,
    );
    this.logger.log("AuthService initialized with Redis storage");
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.logger.log("AuthService shutting down");
  }

  /**
   * Clean up expired challenges
   */
  private async cleanupExpiredChallenges(): Promise<void> {
    try {
      const cleaned = await this.authRedisService.cleanupExpiredChallenges();
      if (cleaned > 0) {
        this.logger.debug(`Cleaned up ${cleaned} expired challenges`);
      }
    } catch (error) {
      this.logger.error("Failed to cleanup expired challenges:", error);
    }
  }

  /**
   * Get auth statistics for monitoring
   */
  async getStats(): Promise<{
    activeChallenges: number;
    activeRefreshTokens: number;
    redisHealthy: boolean;
  }> {
    const [stats, redisHealthy] = await Promise.all([
      this.authRedisService.getStats(),
      this.authRedisService.isHealthy(),
    ]);

    return {
      ...stats,
      redisHealthy,
    };
  }
}
