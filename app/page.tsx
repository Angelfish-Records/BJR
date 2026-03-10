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
  backgroundImage?: unknown;
  logoImage?: unknown;
};

const landingQuery = `
  *[_id == "landingPage"][0]{
    title,
    subtitle,
    eyebrow,
    ctaText,
    ctaHref,
    logoAlt,
    backgroundImage,
    logoImage
  }
`;

const dupesQuery = `
  count(*[_type == "landingPage" && _id != "landingPage"])
`;

export default async function Home() {
  const [data, dupesCount] = await Promise.all([
    client.fetch<LandingPageData>(landingQuery, {}, { next: { tags: ["landingPage"] } }),
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
    ? urlFor(data.logoImage).width(1800).quality(90).url()
    : null;

  const title = data?.title?.trim() || "A new home for independent work.";
  const subtitle =
    data?.subtitle?.trim() ||
    "An artist-built platform for music, film, writing, membership, and direct connection without the usual platform compromises.";
  const eyebrow = data?.eyebrow?.trim() || "Independent platform in development";
  const ctaText = data?.ctaText?.trim() || "Visit the label site";
  const ctaHref = data?.ctaHref?.trim() || "https://angelfishrecords.com";
  const logoAlt = data?.logoAlt?.trim() || "Site logo";

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

        .landingShell {
          position: relative;
          min-height: 100svh;
          display: grid;
          place-items: center;
          padding: clamp(28px, 4vw, 48px);
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
            radial-gradient(1200px 720px at 14% 18%, rgba(255,255,255,0.10), transparent 60%),
            radial-gradient(980px 720px at 84% 24%, rgba(255,255,255,0.06), transparent 58%),
            radial-gradient(900px 620px at 50% 100%, rgba(120,120,160,0.10), transparent 60%);
          opacity: 0.8;
        }

        .landingBackdrop::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(0,0,0,0.54) 0%, rgba(0,0,0,0.40) 30%, rgba(0,0,0,0.72) 100%),
            linear-gradient(90deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.08) 35%, rgba(0,0,0,0.26) 100%);
        }

        .landingGrid {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 1320px;
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
          gap: clamp(28px, 4vw, 64px);
          align-items: center;
        }

        .landingHero {
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 20px;
        }

        .landingEyebrow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-height: 34px;
          padding: 0 14px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px;
          background: rgba(255,255,255,0.04);
          box-shadow: 0 18px 40px rgba(0,0,0,0.18);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          color: rgba(255,255,255,0.74);
          font-size: 12px;
          line-height: 1;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          white-space: nowrap;
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
          max-width: min(100%, 760px);
        }

        .landingLogoImage {
          position: relative;
          z-index: 1;
          display: inline-block;
          width: 100%;
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
          font-size: clamp(52px, 9vw, 124px);
          line-height: 0.94;
          letter-spacing: -0.04em;
          text-wrap: balance;
          text-shadow: 0 18px 38px rgba(0,0,0,0.34);
        }

        .landingSubtitle {
          margin: 0;
          max-width: 780px;
          font-size: clamp(18px, 2.2vw, 26px);
          line-height: 1.55;
          letter-spacing: -0.01em;
          color: rgba(255,255,255,0.78);
          text-wrap: pretty;
        }

        .landingBody {
          margin: 0;
          max-width: 700px;
          font-size: 15px;
          line-height: 1.7;
          color: rgba(255,255,255,0.60);
          text-wrap: pretty;
        }

        .landingActions {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          padding-top: 8px;
        }

        .landingCta {
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
          transition: transform 160ms ease, opacity 160ms ease, background 160ms ease, border-color 160ms ease;
        }

        .landingCta:hover {
          transform: translateY(-1px);
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.18);
        }

        .landingPanel {
          min-width: 0;
          position: relative;
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 30px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%);
          box-shadow:
            0 40px 90px rgba(0,0,0,0.38),
            inset 0 1px 0 rgba(255,255,255,0.06);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          overflow: hidden;
        }

        .landingPanel::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(700px 260px at 50% -8%, rgba(255,255,255,0.10), transparent 60%),
            linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.00));
        }

        .landingPanelInner {
          position: relative;
          z-index: 1;
          padding: clamp(22px, 3vw, 34px);
          display: grid;
          gap: 18px;
        }

        .landingPanelKicker {
          margin: 0;
          font-size: 12px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.54);
        }

        .landingPanelTitle {
          margin: 0;
          font-size: clamp(22px, 3vw, 32px);
          line-height: 1.08;
          letter-spacing: -0.03em;
          color: rgba(255,255,255,0.96);
        }

        .landingPanelCopy {
          margin: 0;
          font-size: 15px;
          line-height: 1.7;
          color: rgba(255,255,255,0.66);
          text-wrap: pretty;
        }

        .landingPanelMeta {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .landingMetaCard {
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          background: rgba(255,255,255,0.04);
          padding: 14px 14px 12px;
        }

        .landingMetaLabel {
          margin: 0 0 6px;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.46);
        }

        .landingMetaValue {
          margin: 0;
          font-size: 14px;
          line-height: 1.45;
          color: rgba(255,255,255,0.82);
        }

        .landingFootnote {
          margin: 2px 0 0;
          font-size: 12px;
          line-height: 1.6;
          color: rgba(255,255,255,0.46);
        }

        @media (max-width: 980px) {
          .landingGrid {
            grid-template-columns: 1fr;
            gap: 24px;
            align-items: start;
          }

          .landingHero {
            gap: 18px;
          }

          .landingPanelMeta {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .landingShell {
            padding: 18px;
          }

          .landingPanel {
            border-radius: 24px;
          }

          .landingActions {
            align-items: stretch;
          }

          .landingActions > * {
            width: 100%;
          }

          .landingCta {
            width: 100%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .landingLogoVeil,
          .landingLogoVeil::before,
          .landingLogoVeil::after,
          .landingLogoGlisten,
          .landingLogoGlisten::before {
            animation: none !important;
          }

          .landingLogoGlisten {
            opacity: 0 !important;
          }

          .landingLogoVeil {
            opacity: 0.22 !important;
          }

          .landingCta {
            transition: none;
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
          filter: bgUrl ? "saturate(0.86) contrast(1.05) brightness(0.82)" : undefined,
          transform: "scale(1.02)",
        }}
      />

      <div className="landingBackdrop" />

      <div className="landingShell">
        <section className="landingGrid">
          <div className="landingHero">
            <div className="landingEyebrow">
              <span className="landingEyebrowDot" aria-hidden="true" />
              <span>{eyebrow}</span>
            </div>

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
                  width={1600}
                  height={520}
                  priority
                  sizes="(max-width: 980px) 92vw, 760px"
                  className="landingLogoImage"
                />
                <div aria-hidden="true" className="landingLogoVeil" />
                <div aria-hidden="true" className="landingLogoGlisten" />
              </div>
            ) : (
              <h1 className="landingHeadingFallback">{title}</h1>
            )}

            <p className="landingSubtitle">{subtitle}</p>

            <p className="landingBody">
              Built as a direct, artist-owned home for releases, film, writing, membership,
              commentary, and deeper audience connection.
            </p>

            <div className="landingActions">
              <EarlyAccessForm />
              <a
                href={ctaHref}
                className="landingCta"
                target="_blank"
                rel="noreferrer"
              >
                {ctaText}
              </a>
            </div>
          </div>

          <aside className="landingPanel">
            <div className="landingPanelInner">
              <p className="landingPanelKicker">Early access</p>
              <h2 className="landingPanelTitle">
                Enter the list before the public platform opens.
              </h2>
              <p className="landingPanelCopy">
                Join the list for launch updates, early listening windows, membership news,
                and first access to the independent platform taking shape behind this page.
              </p>

              <div className="landingPanelMeta">
                <div className="landingMetaCard">
                  <p className="landingMetaLabel">Built for</p>
                  <p className="landingMetaValue">
                    music, film, writing, gated releases, and direct supporter relationships
                  </p>
                </div>

                <div className="landingMetaCard">
                  <p className="landingMetaLabel">Designed around</p>
                  <p className="landingMetaValue">
                    ownership, atmosphere, premium presentation, and platform independence
                  </p>
                </div>

                <div className="landingMetaCard">
                  <p className="landingMetaLabel">Current state</p>
                  <p className="landingMetaValue">
                    outer landing page live, full member platform under active construction
                  </p>
                </div>
              </div>

              <p className="landingFootnote">
                This page is intentionally spare. The architecture behind it is not.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}