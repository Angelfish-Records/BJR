"use client";

import type { ChangeEvent, KeyboardEvent } from "react";

import {
  getMembersEmptyLabel,
  getSearchButtonLabel,
} from "./model";
import {
  cardStyle,
  fieldStyle,
  primaryButtonStyle,
  subtleButtonStyle,
} from "./styles";
import type { MemberRow } from "./types";

type Props = Readonly<{
  query: string;
  members: MemberRow[];
  selectedId: string | null;
  busy: boolean;
  onQueryChange: (value: string) => void;
  onSearch: (queryValue: string) => Promise<void>;
  onSelectMember: (member: MemberRow) => Promise<void>;
}>;

export function MemberSearchSection(props: Props) {
  function submitSearch() {
    void props.onSearch(props.query);
  }

  function clearSearch() {
    props.onQueryChange("");
    void props.onSearch("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    submitSearch();
  }

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, letterSpacing: "0.04em", opacity: 0.56 }}>
        MEMBERS
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <input
          value={props.query}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            props.onQueryChange(event.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder="Filter members by email…"
          style={{
            ...fieldStyle,
            flex: "1 1 320px",
          }}
        />

        <button
          type="button"
          onClick={submitSearch}
          disabled={props.busy}
          style={{
            ...primaryButtonStyle,
            minWidth: 96,
            opacity: props.busy ? 0.6 : 1,
            cursor: props.busy ? "default" : "pointer",
          }}
        >
          {getSearchButtonLabel(props.busy, props.query)}
        </button>

        {props.query.trim() ? (
          <button
            type="button"
            onClick={clearSearch}
            disabled={props.busy}
            style={{
              ...subtleButtonStyle,
              minWidth: 72,
              opacity: props.busy ? 0.6 : 1,
              cursor: props.busy ? "default" : "pointer",
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gap: 4,
          marginTop: 12,
          maxHeight: 360,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {props.busy && props.members.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.58 }}>Loading members…</div>
        ) : null}

        {props.members.map((member, index) => {
          const isActive = props.selectedId === member.id;
          const isEven = index % 2 === 0;

          let background = "rgba(255,255,255,0.055)";
          if (isActive) {
            background = "rgba(255,255,255,0.12)";
          } else if (isEven) {
            background = "rgba(255,255,255,0.035)";
          }

          return (
            <button
              key={member.id}
              type="button"
              onClick={() => {
                void props.onSelectMember(member);
              }}
              style={{
                textAlign: "left",
                padding: "7px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background,
                color: "rgba(255,255,255,0.92)",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.96 }}>
                {member.email}
              </div>
            </button>
          );
        })}

        {!props.busy && props.members.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.58 }}>
            {getMembersEmptyLabel(props.query)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
