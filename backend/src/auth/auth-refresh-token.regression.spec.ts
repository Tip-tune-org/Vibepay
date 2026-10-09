import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

describe("AuthService refresh-token claim compatibility", () => {
  const user = {
    id: "user-123",
    walletAddress: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    isArtist: false,
  };

  function createService(payload: Record<string, unknown>) {
    const service = Object.create(AuthService.prototype) as any;
    service.jwtService = {
      verify: jest.fn().mockReturnValue(payload),
      sign: jest.fn().mockReturnValue("new-access-token"),
    };
    service.authRedisService = {
      validateRefreshToken: jest.fn().mockResolvedValue(true),
    };
    service.userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
    };
    service.logger = { debug: jest.fn(), error: jest.fn() };
    return service;
  }

  it('accepts the "sub" claim used by tokens issued by AuthService', async () => {
    const service = createService({ sub: "user-123", tokenId: "refresh-123" });

    await expect(service.refreshAccessToken("signed-refresh-token")).resolves.toEqual({
      accessToken: "new-access-token",
    });

    expect(service.authRedisService.validateRefreshToken).toHaveBeenCalledWith(
      "refresh-123",
      "user-123",
    );
    expect(service.userRepository.findOne).toHaveBeenCalledWith({
      where: { id: "user-123" },
    });
  });

  it("rejects refresh tokens without a subject or token ID", async () => {
    const service = createService({ tokenId: "refresh-123" });

    await expect(
      service.refreshAccessToken("malformed-refresh-token"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.authRedisService.validateRefreshToken).not.toHaveBeenCalled();
  });
});
