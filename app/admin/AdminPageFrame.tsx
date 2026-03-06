import React from "react";

type Props = {
  title: string;
  subtitle?: string;
  embed?: boolean;
  maxWidth?: number;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
};

export default function AdminPageFrame(props: Props) {
  const {
    title,
    subtitle,
    embed = false,
    maxWidth = 1120,
    headerActions,
    children,
  } = props;

  const outerStyle: React.CSSProperties = {
    padding: embed ? "22px 24px 26px" : "28px 28px 32px",
    maxWidth: embed ? undefined : maxWidth,
    margin: embed ? undefined : "0 auto",
  };

  return (
    <div style={outerStyle}>
      <div
        style={{
          display: "grid",
          gap: 20,
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 14,
            padding: "2px 2px 0",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 18,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  opacity: 0.5,
                  userSelect: "none",
                }}
              >
                Admin
              </div>
              <h1
                style={{
                  margin: "7px 0 0",
                  fontSize: 24,
                  lineHeight: 1.08,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.97)",
                  textWrap: "balance",
                }}
              >
                {title}
              </h1>
              {subtitle ? (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 13,
                    lineHeight: 1.58,
                    opacity: 0.72,
                    maxWidth: 820,
                  }}
                >
                  {subtitle}
                </div>
              ) : null}
            </div>

            {headerActions ? (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  justifyContent: "flex-start",
                }}
              >
                {headerActions}
              </div>
            ) : null}
          </div>

          <div
            style={{
              height: 1,
              background:
                "linear-gradient(90deg, rgba(255,224,166,0.24), rgba(255,255,255,0.08) 35%, rgba(255,255,255,0))",
              opacity: 0.75,
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            minHeight: 0,
          }}
        >
          {children}
        </div>
      </div>

      {embed ? (
        <style>{`
          html, body {
            background: transparent !important;
          }

          body {
            color: rgba(255,255,255,0.94);
          }

          ::selection {
            background: rgba(255, 222, 160, 0.22);
          }

          ::-webkit-scrollbar {
            width: 12px;
            height: 12px;
          }

          ::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.03);
          }

          ::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.14);
            border-radius: 999px;
            border: 2px solid rgba(10,10,14,0.92);
          }

          ::-webkit-scrollbar-thumb:hover {
            background: rgba(255,255,255,0.22);
          }
        `}</style>
      ) : null}
    </div>
  );
}