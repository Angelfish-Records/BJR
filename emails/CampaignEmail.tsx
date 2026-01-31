// emails/CampaignEmail.tsx
import * as React from "react";
import { Html, Head, Preview, Body, Container, Section, Text } from "@react-email/components";
import { Markdown } from "@react-email/markdown";

export type FanMailoutProps = {
  previewText?: string;
  brandName?: string;
  heroUrl?: string;
  bodyMarkdown: string;
  unsubscribeUrl?: string;
};

// Dark + regal purple palette (lean, email-safe)
const PAGE_BG = "#07060B";
const BOX_BG = "#121022";
const BOX_INNER = "#161332";
const BORDER = "rgba(186, 134, 255, 0.14)";
const TEXT = "rgba(246, 243, 255, 0.92)";
const MUTED = "rgba(246, 243, 255, 0.70)";
const ACCENT = "#B58CFF";
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

  // Header mark (replaces logo entirely)
  topMarkWrap: {
    textAlign: "center" as const,
    paddingBottom: 18,
  },
  monogramChip: {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: 999,
    border: `1px solid ${BORDER}`,
    backgroundColor: "rgba(255,255,255,0.03)",
    color: TEXT,
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    fontSize: 11,
    letterSpacing: "2.8px",
    textTransform: "uppercase" as const,
    lineHeight: "1",
  } as const,
  markRule: {
    margin: "12px auto 0",
    width: 220,
    borderTop: `1px solid ${SUBTLE}`,
    opacity: 0.9,
  } as const,

  card: {
    backgroundColor: BOX_BG,
    borderRadius: 22,
    overflow: "hidden" as const,
    border: `1px solid ${BORDER}`,
  },
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

type MarkdownCustomStyles = React.ComponentProps<typeof Markdown>["markdownCustomStyles"];

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
  h2: { fontSize: "15px", lineHeight: "1.3", margin: "14px 0 8px", color: TEXT },
  li: { margin: "0 0 6px" },
  strong: { color: TEXT },
  em: { color: MUTED },
};

export default function FanMailout(props: FanMailoutProps) {
  const {
    previewText,
    brandName = "Angelfish Records",
    heroUrl,
    bodyMarkdown,
    unsubscribeUrl,
  } = props;

  const preview = previewText ?? brandName;

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
        <style>{`
          :root { color-scheme: light; supported-color-schemes: light; }
          body { -webkit-text-size-adjust: 100%; }
          img { filter: none !important; -webkit-filter: none !important; }

          .bg-page { background: ${PAGE_BG} !important; }
          .card { background: ${BOX_BG} !important; }
          .prose, .prose * { color: ${TEXT} !important; }
          .prose a { color: ${ACCENT} !important; }
        `}</style>
      </Head>

      <Preview>{preview}</Preview>

      <Body style={styles.body} className="bg-page">
        <Container style={styles.outer}>
          {/* Fixed monogram mark */}
          <Section style={styles.topMarkWrap}>
            <Text style={{ margin: 0 }}>
              <span style={styles.monogramChip}>BJR</span>
            </Text>
            <div style={styles.markRule} />
          </Section>

          <Section style={styles.card} className="card">
            {heroUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={heroUrl} alt="" width={720} style={styles.hero} />
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
                  markdownCustomStyles={mdStyles as unknown as MarkdownCustomStyles}
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
