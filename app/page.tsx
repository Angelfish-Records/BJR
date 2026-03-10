// web/app/page.tsx
import Image from "next/image";
import { client } from "../sanity/lib/client";
import { urlFor } from "../sanity/lib/image";
import EarlyAccessForm from "./EarlyAccessForm";

type LandingPageData = {
  title?: string | null;
  subtitle?: string | null;
  eyebrow?: string | null;
  ctaText?: string | null;
  ctaHref?: string | null;
  logoAlt?: string | null;
  logoHeightPx?: number | null;
  ctaImageAlt?: string | null;
  ctaImageHeightPx?: number | null;
  backgroundImage?: unknown;
  logoImage?: unknown;
  ctaImage?: unknown;
};

const landingQuery = `
  *[_id == "landingPage"][0]{
    title,
    subtitle,
    eyebrow,
    ctaText,
    ctaHref,
    logoAlt,
    logoHeightPx,
    ctaImageAlt,
    ctaImageHeightPx,
    backgroundImage,
    logoImage,
    ctaImage
  }
`;

const dupesQuery = `
  count(*[_type == "landingPage" && _id != "landingPage"])
`;

export default async function Home() {
  const [data, dupesCount] = await Promise.all([
    client.fetch<LandingPageData>(
      landingQuery,
      {},
      { next: { tags: ["landingPage"] } },
    ),
    client.fetch<number>(dupesQuery),
  ]);

  if (dupesCount > 0) {
    console.error(
      `Sanity warning: ${dupesCount} rogue landingPage documents exist. Homepage is using the singleton.`,
    );
  }

  const bgUrl = data?.backgroundImage
    ? urlFor(data.backgroundImage).width(2400).height(1600).quality(82).url()
    : null;

  const logoUrl = data?.logoImage
    ? urlFor(data.logoImage).width(2200).quality(92).url()
    : null;

  const ctaImageUrl = data?.ctaImage
    ? urlFor(data.ctaImage).width(1200).quality(90).url()
    : null;

  const title = data?.title?.trim() || "Coming soon";
  const subtitle =
    data?.subtitle?.trim() ||
    "A new home for audio and video—built for members, not platforms.";
  const eyebrow = data?.eyebrow?.trim() || "";
  const ctaText = data?.ctaText?.trim() || "Visit label site";
  const ctaHref = data?.ctaHref?.trim() || "https://angelfishrecords.com";
  const logoAlt = data?.logoAlt?.trim() || "Site logo";
  const logoHeightPx = Math.max(48, Math.min(420, data?.logoHeightPx ?? 132));
  const ctaImageAlt = data?.ctaImageAlt?.trim() || ctaText;
  const ctaImageHeightPx = Math.max(
    28,
    Math.min(160, data?.ctaImageHeightPx ?? 44),
  );

  return (
    <main
      style={{
        minHeight: "100svh",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#040405",
        color: "rgba(255,255,255,0.92)",
      }}
    >
      <style>{`
        @keyframes afLogoVeilDrift {
          0%, 100% {
            background-position: 0% 50%;
            opacity: 0.26;
            transform: translateX(-2%) translateY(-0.6%);
          }
          55% {
            background-position: 100% 50%;
            opacity: 0.84;
            transform: translateX(2%) translateY(0.6%);
          }
        }

        @keyframes afLogoVeilDriftSlow {
          0%, 100% {
            background-position: 100% 50%;
            opacity: 0.18;
            transform: translateX(2%) translateY(0.35%);
          }
          55% {
            background-position: 0% 50%;
            opacity: 0.46;
            transform: translateX(-2%) translateY(-0.35%);
          }
        }

        @keyframes afLogoVeilNoiseDrift {
          0% {
            transform: translateX(0%) translateY(0%);
            background-position: 0% 0%, 30% 10%;
            opacity: 0.08;
          }
          50% {
            transform: translateX(1.8%) translateY(-1.2%);
            background-position: 60% 40%, 10% 70%;
            opacity: 0.12;
          }
          100% {
            transform: translateX(0%) translateY(0%);
            background-position: 0% 0%, 30% 10%;
            opacity: 0.08;
          }
        }

        @keyframes afLogoGlistenOpacity {
          0%, 84% { opacity: 0; }
          86% { opacity: 0.14; }
          98% { opacity: 0.56; }
          99.5% { opacity: 0.08; }
          100% { opacity: 0; }
        }

        @keyframes afLogoGlistenTravel {
          0%, 84% {
            background-position: -260% -260%, -260% -260%;
          }
          81% {
            background-position: -160% -160%, -160% -160%;
          }
          99% {
            background-position: 260% 260%, 260% 260%;
          }
          99.5%, 100% {
            background-position: 340% 340%, 340% 340%;
          }
        }

        .landingBackdrop {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .landingBackdrop::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(1200px 780px at 18% 18%, rgba(255,255,255,0.10), transparent 60%),
            radial-gradient(980px 740px at 82% 30%, rgba(255,255,255,0.06), transparent 58%),
            radial-gradient(920px 680px at 50% 100%, rgba(120,120,160,0.10), transparent 60%);
          opacity: 0.76;
        }

        .landingBackdrop::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.48) 38%, rgba(0,0,0,0.78) 100%),
            linear-gradient(90deg, rgba(0,0,0,0.24) 0%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.24) 100%);
        }

        .landingBackdropGrain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.04;
          mix-blend-mode: soft-light;
          background-image:
            radial-gradient(circle at 20% 20%, rgba(255,255,255,0.65) 0 0.6px, transparent 0.8px),
            radial-gradient(circle at 70% 60%, rgba(255,255,255,0.45) 0 0.6px, transparent 0.9px);
          background-size: 12px 12px, 17px 17px;
        }

        .landingShell {
          position: relative;
          z-index: 1;
          min-height: 100svh;
          display: grid;
          place-items: center;
          padding: clamp(28px, 4vw, 48px) 20px;
        }

                .landingContent {
          width: 100%;
          max-width: 880px;
          display: grid;
          justify-items: center;
          text-align: center;
          gap: 18px;
        }

        .landingLogoBlock {
          display: grid;
          justify-items: center;
          gap: 24px;
        }

                .landingEyebrow,
        .landingSubtitlePill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          padding: 0 14px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px;
          background: rgba(255,255,255,0.04);
          box-shadow: 0 18px 40px rgba(0,0,0,0.18);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          white-space: nowrap;
        }

        .landingEyebrow {
          gap: 10px;
          color: rgba(255,255,255,0.74);
          font-size: 12px;
          line-height: 1;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .landingEyebrowDot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: rgba(255,255,255,0.76);
          box-shadow: 0 0 18px rgba(255,255,255,0.24);
          opacity: 0.85;
        }

        .landingLogoWrap {
          position: relative;
          display: inline-block;
          line-height: 0;
          isolation: isolate;
          overflow: hidden;
          max-width: min(100%, 860px);
        }

        .landingLogoImage {
          position: relative;
          z-index: 1;
          display: inline-block;
          width: auto;
          max-width: 100%;
          height: auto;
          opacity: 0.97;
          filter:
            drop-shadow(0 24px 54px rgba(0,0,0,0.44))
            drop-shadow(0 8px 22px rgba(255,255,255,0.06));
          user-select: none;
        }

        .landingLogoVeil {
          position: absolute;
          inset: -34% -26%;
          pointer-events: none;
          z-index: 2;
          mix-blend-mode: multiply;
          background-image: linear-gradient(
            90deg,
            rgba(0,0,0,0.00) 0%,
            rgba(0,0,0,0.82) 22%,
            rgba(0,0,0,0.995) 48%,
            rgba(0,0,0,0.70) 68%,
            rgba(0,0,0,0.00) 100%
          );
          background-repeat: no-repeat;
          background-size: 220% 100%;
          background-position: 0% 50%;
          opacity: 0.24;
          filter: blur(1.15px);
          animation: afLogoVeilDrift 14.5s ease-in-out infinite;
          will-change: transform, opacity, background-position;
        }

        .landingLogoVeil::before {
          content: "";
          position: absolute;
          inset: -10% -18%;
          pointer-events: none;
          background-image: linear-gradient(
            90deg,
            rgba(0,0,0,0.00) 0%,
            rgba(0,0,0,0.55) 30%,
            rgba(0,0,0,0.65) 52%,
            rgba(0,0,0,0.40) 72%,
            rgba(0,0,0,0.00) 100%
          );
          background-repeat: no-repeat;
          background-size: 240% 100%;
          background-position: 100% 50%;
          opacity: 0.28;
          filter: blur(2.2px);
          animation: afLogoVeilDriftSlow 21s ease-in-out infinite;
          will-change: transform, opacity, background-position;
        }

        .landingLogoVeil::after {
          content: "";
          position: absolute;
          inset: -16% -16%;
          pointer-events: none;
          background-image:
            repeating-radial-gradient(circle at 12% 18%, rgba(255,255,255,0.09) 0 0.7px, rgba(255,255,255,0.00) 0.7px 2.2px),
            repeating-radial-gradient(circle at 74% 63%, rgba(255,255,255,0.06) 0 0.8px, rgba(255,255,255,0.00) 0.8px 2.6px);
          background-size: 140px 110px, 170px 140px;
          background-position: 0% 0%, 30% 10%;
          mix-blend-mode: soft-light;
          opacity: 0.10;
          filter: blur(0.35px);
          animation: afLogoVeilNoiseDrift 27s linear infinite;
          will-change: transform, opacity, background-position;
        }

        .landingLogoGlisten {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 6;
          -webkit-mask-image: var(--afLogoMaskUrl);
          mask-image: var(--afLogoMaskUrl);
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-size: contain;
          mask-size: contain;
          -webkit-mask-position: center;
          mask-position: center;
          mix-blend-mode: screen;
          opacity: 0;
          animation: afLogoGlistenOpacity 62s ease-in-out infinite;
          will-change: opacity;
        }

        .landingLogoGlisten::before {
          content: "";
          position: absolute;
          inset: -20%;
          pointer-events: none;
          background-image:
            linear-gradient(
              120deg,
              rgba(255,255,255,0.00) 0%,
              rgba(255,255,255,0.00) 16%,
              rgba(255,255,255,0.07) 46%,
              rgba(255,255,255,0.00) 76%,
              rgba(255,255,255,0.00) 100%
            ),
            linear-gradient(
              120deg,
              rgba(255,255,255,0.00) 0%,
              rgba(255,255,255,0.00) 36%,
              rgba(255,255,255,0.24) 50%,
              rgba(255,255,255,0.00) 64%,
              rgba(255,255,255,0.00) 100%
            );
          background-repeat: no-repeat;
          background-size: 420% 420%, 420% 420%;
          background-position: -260% -260%, -260% -260%;
          filter: blur(1.1px);
          transform: rotate(-10deg) skewX(-10deg) scaleY(1.06);
          border-radius: 999px;
          animation: afLogoGlistenTravel 62s ease-in-out infinite;
          will-change: background-position, transform;
        }

        .landingHeadingFallback {
          margin: 0;
          font-size: clamp(42px, 8vw, 84px);
          line-height: 0.96;
          letter-spacing: -0.04em;
          text-wrap: balance;
          text-shadow: 0 18px 38px rgba(0,0,0,0.34);
        }

                .landingSubtitlePill {
          position: relative;
          max-width: min(100%, 560px);
          min-height: 40px;
          padding: 0 22px;
          border-color: rgba(255,255,255,0.10);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.018) 100%);
          box-shadow:
            0 16px 34px rgba(0,0,0,0.18),
            inset 0 1px 0 rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.58);
          font-size: clamp(11px, 1.05vw, 12px);
          line-height: 1;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          text-shadow:
            0 1px 0 rgba(255,255,255,0.04),
            0 -1px 0 rgba(0,0,0,0.28);
          filter: saturate(0.85);
        }

        .landingSubtitlePill::before {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: 999px;
          pointer-events: none;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.00));
          opacity: 0.7;
        }

        .landingSubtitlePill > span {
          position: relative;
          z-index: 1;
          display: inline-block;
          transform: translateX(0.11em);
          mix-blend-mode: screen;
        }

                .landingActions {
          display: grid;
          justify-items: center;
          gap: 14px;
          width: 100%;
          margin-top: 8px;
        }

        .landingCtaLink {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 48px;
          padding: 0 18px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.04);
          box-shadow: 0 14px 32px rgba(0,0,0,0.22);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          color: rgba(255,255,255,0.88);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: background 160ms ease, border-color 160ms ease, opacity 160ms ease, filter 160ms ease;
        }

        .landingCtaLink:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.18);
          filter: brightness(1.02);
        }

        .landingCtaImageLink {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 10px;
          background: transparent;
          text-decoration: none;
          opacity: 0.72;
          filter: brightness(0.88) saturate(0.94);
          transition: opacity 180ms ease, filter 180ms ease;
        }

        .landingCtaImageLink:hover {
          opacity: 1;
          filter: brightness(1) saturate(1);
        }

        .landingCtaImageLink:focus-visible {
          outline: none;
          opacity: 1;
          filter: brightness(1) saturate(1);
        }

        .landingCtaImage {
          display: block;
          width: auto;
          height: auto;
          max-width: min(100%, 420px);
          filter:
            drop-shadow(0 14px 30px rgba(0,0,0,0.24))
            drop-shadow(0 4px 12px rgba(255,255,255,0.04));
        }

        @media (max-width: 640px) {
          .landingShell {
            padding: 18px;
          }

          .landingContent {
            gap: 16px;
          }

                    .landingSubtitlePill {
            max-width: 100%;
            white-space: normal;
            line-height: 1.35;
            padding-top: 9px;
            padding-bottom: 9px;
          }

          .landingSubtitlePill > span {
            transform: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .landingLogoVeil,
          .landingLogoVeil::before,
          .landingLogoVeil::after,
          .landingLogoGlisten,
          .landingLogoGlisten::before,
          .landingCtaLink,
          .landingCtaImageLink {
            animation: none !important;
            transition: none !important;
          }

          .landingLogoGlisten {
            opacity: 0 !important;
          }

          .landingLogoVeil {
            opacity: 0.22 !important;
          }
        }
      `}</style>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: bgUrl
            ? `url(${bgUrl})`
            : "linear-gradient(180deg, #050506 0%, #0a0a10 54%, #050506 100%)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: bgUrl
            ? "saturate(0.86) contrast(1.05) brightness(0.82)"
            : undefined,
          transform: "scale(1.02)",
        }}
      />

      <div className="landingBackdrop" />
      <div className="landingBackdropGrain" />

      <div className="landingShell">
        <section className="landingContent">
          {eyebrow ? (
            <div className="landingEyebrow">
              <span className="landingEyebrowDot" aria-hidden="true" />
              <span>{eyebrow}</span>
            </div>
          ) : null}

          <div className="landingLogoBlock">
            {logoUrl ? (
              <div
                className="landingLogoWrap"
                style={
                  {
                    ["--afLogoMaskUrl" as const]: `url(${logoUrl})`,
                  } as React.CSSProperties
                }
              >
                <Image
                  src={logoUrl}
                  alt={logoAlt}
                  width={2200}
                  height={Math.max(120, logoHeightPx * 6)}
                  priority
                  sizes="(max-width: 768px) 92vw, 860px"
                  className="landingLogoImage"
                  style={{
                    height: logoHeightPx,
                  }}
                />
                <div aria-hidden="true" className="landingLogoVeil" />
                <div aria-hidden="true" className="landingLogoGlisten" />
              </div>
            ) : (
              <h1 className="landingHeadingFallback">{title}</h1>
            )}

            <div className="landingSubtitlePill">
              <span>{subtitle}</span>
            </div>
          </div>

          <div className="landingActions">
            <EarlyAccessForm />

            {ctaHref ? (
              ctaImageUrl ? (
                <a
                  href={ctaHref}
                  target="_blank"
                  rel="noreferrer"
                  className="landingCtaImageLink"
                  aria-label={ctaImageAlt}
                >
                  <Image
                    src={ctaImageUrl}
                    alt={ctaImageAlt}
                    width={1200}
                    height={Math.max(80, ctaImageHeightPx * 6)}
                    className="landingCtaImage"
                    style={{
                      height: ctaImageHeightPx,
                    }}
                  />
                </a>
              ) : (
                <a
                  href={ctaHref}
                  target="_blank"
                  rel="noreferrer"
                  className="landingCtaLink"
                >
                  {ctaText}
                </a>
              )
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
