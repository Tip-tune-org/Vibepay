import React, { useState, useCallback, useEffect } from "react";
import { ProfileSetup } from "./ProfileSetup";
import { FirstTrackUpload } from "./FirstTrackUpload";
import { useOnboardingPersistence } from "@/hooks/useOnboardingPersistence";
import { useValidation } from "@/hooks/useValidation";
import { analytics } from "@/types/analytics";
import { OnboardingComplete } from "./Onboardingcomplete";
import { ProgressIndicator } from "./Progressindicator";
import { OnboardingStep } from "./OnboardingStep";
import { Step } from "@/types/onboarding";
import { onboardingService } from "@/services/onboardingService";
import "./../onboarding.css";

const STEPS: Step[] = [
  {
    id: "welcome",
    index: 0,
    title: "Welcome",
    subtitle: "Discover VibePay",
    skippable: false,
  },
  {
    id: "profile",
    index: 1,
    title: "Profile",
    subtitle: "Tell your story",
    skippable: false,
  },
  {
    id: "wallet",
    index: 2,
    title: "Wallet",
    subtitle: "Connect Stellar",
    skippable: true,
  },
  {
    id: "upload",
    index: 3,
    title: "First Track",
    subtitle: "Share your music",
    skippable: true,
  },
  {
    id: "promotion",
    index: 4,
    title: "Promotion",
    subtitle: "Grow your audience",
    skippable: true,
  },
  {
    id: "complete",
    index: 5,
    title: "Done!",
    subtitle: "You're all set",
    skippable: false,
  },
];

export const ArtistOnboarding: React.FC = () => {
  const { data, setData, saveDraft, goToStep, markStepComplete } =
    useOnboardingPersistence();
  const { errors, validateProfile, validateWallet, validateTrack, clearError } =
    useValidation();
  const [saveNotice, setSaveNotice] = useState(false);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentStep = data.currentStep;
  const step = STEPS[currentStep];

  useEffect(() => {
    analytics.onboardingStepViewed(step.id, currentStep);
  }, [currentStep, step.id]);

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      saveDraft();
    }, 30000);
    return () => clearInterval(interval);
  }, [saveDraft]);

  const handleSaveDraft = useCallback(() => {
    saveDraft();
    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 2000);
  }, [saveDraft]);

  const handleNext = useCallback(() => {
    let valid = true;
    if (currentStep === 1) valid = validateProfile(data);
    if (currentStep === 2) valid = validateWallet(data);
    if (currentStep === 3) valid = validateTrack(data);
    if (!valid) return;
    markStepComplete(currentStep);
    goToStep(Math.min(currentStep + 1, STEPS.length - 1));
  }, [
    currentStep,
    data,
    validateProfile,
    validateWallet,
    validateTrack,
    markStepComplete,
    goToStep,
  ]);

  const handleBack = useCallback(() => {
    goToStep(Math.max(currentStep - 1, 0));
  }, [currentStep, goToStep]);

  const handleSkip = useCallback(() => {
    analytics.onboardingSkipped(step.id);
    goToStep(Math.min(currentStep + 1, STEPS.length - 1));
  }, [step.id, currentStep, goToStep]);

  const handleWalletConnect = useCallback(
    async (walletType: "freighter" | "albedo" = "freighter") => {
      setWalletConnecting(true);
      setWalletError(null);

      const result = await onboardingService.verifyWalletConnection(walletType);

      if (result.success) {
        setData((prev) => ({
          ...prev,
          wallet: {
            connected: true,
            publicKey: result.publicKey,
            network: result.network,
          },
          checklist: { ...prev.checklist, wallet_connected: true },
        }));
      } else {
        setWalletError(result.error);
      }

      setWalletConnecting(false);
    },
    [setData]
  );

  const handleChecklistToggle = useCallback(
    (key: string) => {
      setData((prev) => ({
        ...prev,
        checklist: { ...prev.checklist, [key]: !prev.checklist[key] },
      }));
    },
    [setData],
  );

  const updateProfile = useCallback(
    (updates: Partial<typeof data.profile>) => {
      setData((prev) => ({
        ...prev,
        profile: { ...prev.profile, ...updates },
      }));
    },
    [setData],
  );

  const updateTrack = useCallback(
    (updates: Partial<typeof data.track>) => {
      setData((prev) => ({
        ...prev,
        track: { ...prev.track, ...updates },
        checklist: {
          ...prev.checklist,
          track_uploaded: !!(updates.file || prev.track.file),
        },
      }));
    },
    [setData],
  );

  const renderStepContent = () => {
    switch (step.id) {
      case "welcome":
        return <WelcomeStep />;
      case "profile":
        return (
          <ProfileSetup
            data={data}
            errors={errors}
            onChange={(updates) => {
              updateProfile(updates);
              if (updates.name)
                setData((prev) => ({
                  ...prev,
                  checklist: {
                    ...prev.checklist,
                    bio_written: !!updates.bio || prev.profile.bio.length > 20,
                  },
                }));
              if (updates.bio)
                setData((prev) => ({
                  ...prev,
                  checklist: {
                    ...prev.checklist,
                    bio_written: (updates.bio || "").length > 20,
                  },
                }));
            }}
            clearError={clearError}
          />
        );
      case "wallet":
        return (
          <WalletStep
            data={data}
            onConnect={handleWalletConnect}
            connecting={walletConnecting}
            errors={errors}
            walletError={walletError}
          />
        );
      case "upload":
        return (
          <FirstTrackUpload
            data={data}
            errors={errors}
            onChange={updateTrack}
            clearError={clearError}
          />
        );
      case "promotion":
        return <PromotionStep />;
      case "complete":
        return (
          <OnboardingComplete
            data={data}
            onChecklistToggle={handleChecklistToggle}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="onboarding-container">
      <header className="onboarding-header">
        <div className="logo">
          <span className="logo-icon">🎵</span>
          <span className="logo-text">VibePay</span>
        </div>
        <div className="header-actions">
          <button className="save-btn" onClick={handleSaveDraft}>
            {saveNotice ? (
              <>
                <span className="save-check">✓</span> Saved!
              </>
            ) : (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Save Draft
              </>
            )}
          </button>
        </div>
      </header>

      <ProgressIndicator
        steps={STEPS}
        currentStep={currentStep}
        completedSteps={data.completedSteps}
        onStepClick={goToStep}
      />

      <main className="onboarding-main">
        <div className="step-wrapper" key={step.id}>
          {renderStepContent()}
        </div>
      </main>

      {step.id !== "complete" && (
        <footer className="onboarding-footer">
          <div className="nav-left">
            {currentStep > 0 && (
              <button className="btn-ghost" onClick={handleBack}>
                ← Back
              </button>
            )}
          </div>
          <div className="nav-right">
            {step.skippable && (
              <button className="btn-ghost skip-btn" onClick={handleSkip}>
                Skip for now
              </button>
            )}
            <button className="btn-primary" onClick={handleNext}>
              {currentStep === STEPS.length - 2
                ? "Finish Setup 🎉"
                : "Continue →"}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};

// Inline sub-components for steps that are simpler

const WelcomeStep: React.FC = () => (
  <OnboardingStep
    title="Welcome to VibePay for Artists"
    subtitle="Your music. Your fans. Your earnings — on the Stellar blockchain."
    icon={<span className="step-emoji">👋</span>}
  >
    <div className="welcome-grid">
      {[
        {
          icon: "💸",
          title: "Get Tipped Instantly",
          desc: "Fans send XLM directly to your Stellar wallet — no middleman, low fees.",
        },
        {
          icon: "🌍",
          title: "Global Reach",
          desc: "Reach listeners worldwide with borderless Stellar payments.",
        },
        {
          icon: "🎵",
          title: "Upload & Earn",
          desc: "Share tracks, build your fanbase, and earn while doing what you love.",
        },
        {
          icon: "📊",
          title: "Real-Time Analytics",
          desc: "Track plays, tips, and fan engagement in your dashboard.",
        },
      ].map((f) => (
        <div key={f.title} className="welcome-feature">
          <span className="welcome-icon">{f.icon}</span>
          <h3>{f.title}</h3>
          <p>{f.desc}</p>
        </div>
      ))}
    </div>

    <div className="video-embed">
      <div className="video-placeholder">
        <div className="play-button">▶</div>
        <p>Watch: How VibePay works for artists (2 min)</p>
      </div>
    </div>

    <div className="welcome-stats">
      <div className="stat">
        <span className="stat-value">12K+</span>
        <span className="stat-label">Artists</span>
      </div>
      <div className="stat-divider" />
      <div className="stat">
        <span className="stat-value">$2.4M</span>
        <span className="stat-label">Tips Sent</span>
      </div>
      <div className="stat-divider" />
      <div className="stat">
        <span className="stat-value">180+</span>
        <span className="stat-label">Countries</span>
      </div>
    </div>
  </OnboardingStep>
);

interface WalletStepProps {
  data: ReturnType<typeof useOnboardingPersistence>["data"];
  onConnect: (walletType: "freighter" | "albedo") => void;
  connecting: boolean;
  errors: Record<string, string>;
  walletError: string | null;
}

const WalletStep: React.FC<WalletStepProps> = ({
  data,
  onConnect,
  connecting,
  errors,
  walletError,
}) => (
  <OnboardingStep
    title="Connect Your Stellar Wallet"
    subtitle="Link your wallet to receive tips directly from fans."
    icon={<span className="step-emoji">💫</span>}
  >
    {data.wallet.connected ? (
      <div className="wallet-connected-card">
        <div className="wallet-connected-icon">✅</div>
        <div className="wallet-connected-info">
          <h3>Wallet Connected!</h3>
          <p className="wallet-address">{data.wallet.publicKey}</p>
          <span className="network-badge">{data.wallet.network}</span>
        </div>
      </div>
    ) : (
      <>
        <div className="wallet-options">
          <div className="wallet-option-card recommended">
            <div className="recommended-badge">Recommended</div>
            <img
              src="https://freighter.app/favicon.ico"
              alt="Freighter"
              className="wallet-logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="wallet-option-info">
              <h3>Freighter</h3>
              <p>
                Browser extension wallet for Stellar. Free and easy to set up.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => onConnect("freighter")}
              disabled={connecting}
            >
              {connecting ? <span className="spinner" /> : null}
              {connecting ? "Connecting..." : "Connect Freighter"}
            </button>
          </div>

          <div className="wallet-option-card">
            <div className="wallet-option-info">
              <h3>Albedo</h3>
              <p>Web-based Stellar wallet — no installation needed.</p>
            </div>
            <button
              className="btn-secondary"
              onClick={() => onConnect("albedo")}
              disabled={connecting}
            >
              Connect Albedo
            </button>
          </div>
        </div>

        {(errors.wallet || walletError) && (
          <div className="form-error wallet-error">{walletError || errors.wallet}</div>
        )}

        <div className="wallet-explainer">
          <h4>Why connect a wallet?</h4>
          <ul>
            <li>🔒 Receive XLM tips directly and securely</li>
            <li>💸 No platform fees on tips you receive</li>
            <li>⚡ Instant, global payments via Stellar</li>
            <li>🔑 You own your keys — full control over your funds</li>
          </ul>
          <a
            href="https://stellar.org/learn/intro-to-stellar"
            target="_blank"
            rel="noopener noreferrer"
            className="learn-link"
          >
            New to Stellar? Learn the basics →
          </a>
        </div>
      </>
    )}
  </OnboardingStep>
);

const PromotionStep: React.FC = () => (
  <OnboardingStep
    title="Promote Your Music"
    subtitle="Get your tracks in front of more ears. Here's how."
    icon={<span className="step-emoji">📣</span>}
  >
    <div className="promo-tips">
      {[
        {
          number: "01",
          title: "Share Your Profile Link",
          desc: "Copy your VibePay artist URL and post it everywhere — Instagram bio, Twitter, TikTok.",
          action: "Copy Link",
        },
        {
          number: "02",
          title: "Embed the Tip Button",
          desc: 'Add a "Tip Me on VibePay" button to your website or blog in minutes.',
          action: "Get Widget",
        },
        {
          number: "03",
          title: "Engage Your Community",
          desc: "Reply to comments, thank your tippers, and keep fans coming back.",
          action: null,
        },
        {
          number: "04",
          title: "Collaborate with Other Artists",
          desc: "Cross-promote with artists in your genre for mutual growth.",
          action: null,
        },
      ].map((tip) => (
        <div key={tip.number} className="promo-tip-card">
          <span className="promo-number">{tip.number}</span>
          <div className="promo-content">
            <h3>{tip.title}</h3>
            <p>{tip.desc}</p>
          </div>
          {tip.action && (
            <button className="btn-secondary-sm">{tip.action}</button>
          )}
        </div>
      ))}
    </div>

    <div className="video-embed" style={{ marginTop: "1.5rem" }}>
      <div className="video-placeholder">
        <div className="play-button">▶</div>
        <p>Watch: Social media tips for musicians (5 min)</p>
      </div>
    </div>
  </OnboardingStep>
);
