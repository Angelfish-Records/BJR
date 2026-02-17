import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type MailbagAnsweredEmailProps = {
  appName: string;
  toEmail: string;
  questionText: string;
  postTitle?: string | null;
  postUrl: string;
  supportEmail?: string;
};

export function MailbagAnsweredEmail(props: MailbagAnsweredEmailProps) {
  const { appName, toEmail, questionText, postTitle, postUrl, supportEmail } =
    props;

  const safeQ = (questionText || "").trim();
  const preview = `Your question was answered.`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: "#0b0b0b" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "28px 16px" }}>
          <Section style={{ textAlign: "left" }}>
            <Text
              style={{
                color: "#a7a7a7",
                fontSize: 12,
                letterSpacing: 0.3,
                margin: "0 0 10px",
              }}
            >
              {appName}
            </Text>

            <Heading
              style={{
                color: "#ffffff",
                fontSize: 28,
                margin: "0 0 10px",
                lineHeight: 1.15,
              }}
            >
              Your question was answered.
            </Heading>

            <Text
              style={{
                color: "#d7d7d7",
                fontSize: 14,
                margin: "0 0 18px",
                lineHeight: 1.5,
              }}
            >
              I published an answer in{" "}
              <span style={{ color: "#ffffff", fontWeight: 700 }}>
                {postTitle?.trim() ? postTitle.trim() : "a new post"}
              </span>
              .
            </Text>
          </Section>

          {safeQ ? (
            <Section
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: 14,
                padding: 14,
                margin: "0 0 18px",
              }}
            >
              <Text
                style={{
                  color: "#ffffff",
                  fontSize: 12,
                  margin: "0 0 8px",
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                }}
              >
                Your question
              </Text>
              <Text
                style={{
                  color: "#ffffff",
                  fontSize: 13,
                  margin: 0,
                  lineHeight: 1.55,
                }}
              >
                {safeQ}
              </Text>
            </Section>
          ) : null}

          <Section style={{ margin: "0 0 16px" }}>
            <Button
              href={postUrl}
              style={{
                backgroundColor: "#ffffff",
                color: "#0b0b0b",
                fontSize: 14,
                fontWeight: 700,
                padding: "12px 18px",
                borderRadius: 12,
                display: "inline-block",
                textDecoration: "none",
              }}
            >
              Read the answer
            </Button>
          </Section>

          <Text
            style={{
              color: "#bdbdbd",
              fontSize: 12,
              margin: "0 0 18px",
              lineHeight: 1.5,
            }}
          >
            If prompted, sign in with{" "}
            <span style={{ color: "#ffffff" }}>{toEmail}</span>.
          </Text>

          <Hr style={{ borderColor: "rgba(255,255,255,0.10)", margin: "22px 0" }} />

          <Text
            style={{
              color: "#8f8f8f",
              fontSize: 11,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            This is a transactional email triggered by your mailbag submission.
            {supportEmail ? (
              <>
                {" "}
                Need help? Reply to this message or contact{" "}
                <span style={{ color: "#cfcfcf" }}>{supportEmail}</span>.
              </>
            ) : null}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default MailbagAnsweredEmail;
