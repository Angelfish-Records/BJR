// emails/CampaignEmail.tsx
import * as React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Img,
  Text,
} from "@react-email/components";
import { Markdown } from "@react-email/markdown";

export type FanMailoutProps = {
  previewText?: string;
  brandName?: string;
  logoUrl?: string;
  heroUrl?: string;
  bodyMarkdown: string;
  unsubscribeUrl?: string;
};

// Dark + regal purple palette (lean, email-safe)
const PAGE_BG = "#07060B"; // near-black with purple bias
const BOX_BG = "#121022"; // deep aubergine card
const BOX_INNER = "#161332"; // slightly lifted for subtle depth
const BORDER = "rgba(186, 134, 255, 0.14)"; // faint amethyst edge
const TEXT = "rgba(246, 243, 255, 0.92)"; // soft off-white
const MUTED = "rgba(246, 243, 255, 0.70)";
const ACCENT = "#B58CFF"; // amethyst link/accent
const FOOTER_TONE = "rgba(181, 140, 255, 0.92)";
const SUBTLE = "rgba(246, 243, 255, 0.14)";

const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: PAGE_BG,
  },
  outer: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "38px 18px",
  },
  topLogoWrap: {
    textAlign: "center" as const,
    paddingBottom: 18,
  },
  logoImg: {
    display: "inline-block",
    height: 34,
    width: "auto",
  } as const,
  logoPlaceholder: {
    display: "inline-block",
    width: 140,
    height: 34,
    lineHeight: "34px",
    borderRadius: 12,
    border: `1px dashed ${BORDER}`,
    color: MUTED,
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    fontSize: 12,
    letterSpacing: "0.3px",
  } as const,

  card: {
    backgroundColor: BOX_BG,
    borderRadius: 22,
    overflow: "hidden" as const,
    border: `1px solid ${BORDER}`,
  },
  // Optional subtle inner panel to make text area feel lux without extra markup bloat
  content: {
    padding: "22px 22px 24px",
    backgroundColor: BOX_INNER,
  } as const,

  hero: {
    width: "100%",
    display: "block",
  } as const,

  proseWrap: {
    fontSize: 14,
    lineHeight: "1.68",
    color: TEXT,
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    letterSpacing: "0px",
  } as const,

  footerOutside: {
    textAlign: "center" as const,
    marginTop: 16,
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    fontSize: 12,
    lineHeight: "1.4",
    color: FOOTER_TONE,
    letterSpacing: "0.2px",
  } as const,

  unsubscribeOutside: {
    textAlign: "center" as const,
    marginTop: 8,
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    fontSize: 10,
    lineHeight: "1.35",
    color: MUTED,
  } as const,
} as const;

type MarkdownCustomStyles = React.ComponentProps<
  typeof Markdown
>["markdownCustomStyles"];

const mdStyles: Record<string, React.CSSProperties> = {
  p: { margin: "0 0 12px" },
  a: {
    color: ACCENT,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    textDecorationColor: "rgba(181, 140, 255, 0.55)",
  },
  hr: {
    border: 0,
    borderTop: `1px solid ${SUBTLE}`,
    margin: "16px 0",
  },
  h1: { fontSize: "18px", lineHeight: "1.25", margin: "0 0 12px", color: TEXT },
  h2: {
    fontSize: "15px",
    lineHeight: "1.3",
    margin: "14px 0 8px",
    color: TEXT,
  },
  li: { margin: "0 0 6px" },
  strong: { color: TEXT },
  em: { color: MUTED },
};

export default function FanMailout(props: FanMailoutProps) {
  const {
    previewText,
    brandName = "Angelfish Records",
    logoUrl,
    heroUrl,
    bodyMarkdown,
    unsubscribeUrl,
  } = props;
  const preview = previewText ?? brandName;

  return (
    <Html>
      <Head>
        {/* Keep light-only to avoid clients "helpfully" inverting and wrecking contrast */}
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
        <style>{`
          :root { color-scheme: light; supported-color-schemes: light; }
          body { -webkit-text-size-adjust: 100%; }
          img { filter: none !important; -webkit-filter: none !important; }

          /* Client hardening: keep background + text stable */
          .bg-page { background: ${PAGE_BG} !important; }
          .card { background: ${BOX_BG} !important; }
          .prose, .prose * { color: ${TEXT} !important; }
          .prose a { color: ${ACCENT} !important; }
        `}</style>
      </Head>

      <Preview>{preview}</Preview>

      <Body style={styles.body} className="bg-page">
        <Container style={styles.outer}>
          <Section style={styles.topLogoWrap}>
            {logoUrl ? (
              <Img src={logoUrl} alt={brandName} style={styles.logoImg} />
            ) : (
              <Text style={styles.logoPlaceholder}>LOGO</Text>
            )}
          </Section>

          <Section style={styles.card} className="card">
            {heroUrl ? (
              <Img src={heroUrl} alt="" width={720} style={styles.hero} />
            ) : null}

            <Section style={styles.content}>
              <Section style={styles.proseWrap} className="prose">
                <Markdown
                  markdownContainerStyles={{
                    fontFamily: styles.proseWrap.fontFamily,
                    fontSize: styles.proseWrap.fontSize,
                    lineHeight: styles.proseWrap.lineHeight,
                    color: styles.proseWrap.color,
                  }}
                  markdownCustomStyles={
                    mdStyles as unknown as MarkdownCustomStyles
                  }
                >
                  {bodyMarkdown}
                </Markdown>
              </Section>
            </Section>
          </Section>

          <Text style={styles.footerOutside}>{brandName}</Text>

          {unsubscribeUrl ? (
            <Text style={styles.unsubscribeOutside}>
              Don’t want to hear from me again?{" "}
              <a
                href={unsubscribeUrl}
                style={{
                  color: ACCENT,
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                  textDecorationColor: "rgba(181, 140, 255, 0.55)",
                }}
              >
                Click here
              </a>{" "}
              to opt out of future communications.
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
