// sanity/schemaTypes/badgeDefinition.ts
import { defineField, defineType } from "sanity";

const AUTO_QUALIFICATION_MODE_OPTIONS = [
  { title: "Total minutes streamed", value: "minutes_streamed" },
  { title: "Total play count", value: "play_count" },
  { title: "Total complete count", value: "complete_count" },
  { title: "Joined within date window", value: "joined_within_window" },
  { title: "Active within playback window", value: "active_within_window" },
  {
    title: "Recording-specific minutes streamed",
    value: "recording_minutes_streamed",
  },
  {
    title: "Recording-specific play count",
    value: "recording_play_count",
  },
  {
    title: "Recording-specific complete count",
    value: "recording_complete_count",
  },
  {
    title: "Exegesis contribution count",
    value: "exegesis_contribution_count",
  },
  {
    title: "Exegesis cumulative vote tally",
    value: "exegesis_vote_tally",
  },
  {
    title: "Public name unlocked",
    value: "public_name_unlocked",
  },
] as const;

type BadgeDefinitionParent = {
  awardMode?: unknown;
  autoQualificationMode?: unknown;
};

function parentObject(parent: unknown): BadgeDefinitionParent | null {
  return parent && typeof parent === "object"
    ? (parent as BadgeDefinitionParent)
    : null;
}

function isAutomaticBadge(parent: unknown): boolean {
  return parentObject(parent)?.awardMode === "automatic";
}

function autoQualificationMode(parent: unknown): string {
  return String(parentObject(parent)?.autoQualificationMode ?? "");
}

function hiddenUnlessAutomatic(props: { parent: unknown }): boolean {
  return !isAutomaticBadge(props.parent);
}

function hiddenUnlessMode(
  parent: unknown,
  modes: readonly string[],
): boolean {
  return !modes.includes(autoQualificationMode(parent));
}

export const badgeDefinition = defineType({
  name: "badgeDefinition",
  title: "Badge Definition",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: "keySuffix",
      title: "Badge key suffix",
      type: "string",
      description:
        "Enter only the suffix portion, for example early_supporter. The app will derive the entitlement key as badge_early_supporter.",
      validation: (rule) =>
        rule
          .required()
          .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, {
            name: "badge key suffix",
            invert: false,
          })
          .error(
            "Badge key suffixes must use lowercase letters, numbers, and underscores only.",
          ),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: "displayOrder",
      title: "Display order",
      type: "number",
      initialValue: 100,
      validation: (rule) => rule.integer().min(0),
    }),
    defineField({
      name: "featured",
      title: "Featured",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "shareable",
      title: "Shareable",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "undisclosed",
      title: "Undisclosed until unlocked",
      type: "boolean",
      initialValue: false,
      description:
        "Hide this badge from members who have not unlocked it yet. Useful for exclusive, retired, or time-bound badges that should not appear as visible locked promises.",
    }),
    defineField({
      name: "active",
      title: "Active",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "awardMode",
      title: "Award mode",
      type: "string",
      initialValue: "manual",
      options: {
        list: [
          { title: "Manual", value: "manual" },
          { title: "Automatic", value: "automatic" },
        ],
        layout: "radio",
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "autoAwardEnabled",
      title: "Auto-award enabled",
      type: "boolean",
      initialValue: true,
      hidden: hiddenUnlessAutomatic,
    }),
    defineField({
      name: "autoQualificationMode",
      title: "Automatic qualification mode",
      type: "string",
      options: {
        list: AUTO_QUALIFICATION_MODE_OPTIONS.map((option) => ({
          title: option.title,
          value: option.value,
        })),
      },
      hidden: hiddenUnlessAutomatic,
      validation: (rule) =>
        rule.custom((value, context) => {
          if (
            isAutomaticBadge(context.parent) &&
            (typeof value !== "string" || !value.trim())
          ) {
            return "Automatic badges require an automatic qualification mode.";
          }

          return true;
        }),
    }),
    defineField({
      name: "recordingId",
      title: "Recording ID",
      type: "string",
      hidden: ({ parent }) =>
        hiddenUnlessMode(parent, [
          "recording_minutes_streamed",
          "recording_play_count",
          "recording_complete_count",
        ]),
    }),
    defineField({
      name: "minMinutes",
      title: "Minimum minutes",
      type: "number",
      validation: (rule) => rule.min(0),
      hidden: ({ parent }) =>
        hiddenUnlessMode(parent, [
          "minutes_streamed",
          "recording_minutes_streamed",
        ]),
    }),
    defineField({
      name: "minPlayCount",
      title: "Minimum play count",
      type: "number",
      validation: (rule) => rule.min(0),
      hidden: ({ parent }) =>
        hiddenUnlessMode(parent, [
          "play_count",
          "recording_play_count",
          "active_within_window",
        ]),
    }),
    defineField({
      name: "minCompletedCount",
      title: "Minimum complete count",
      type: "number",
      validation: (rule) => rule.min(0),
      hidden: ({ parent }) =>
        hiddenUnlessMode(parent, [
          "complete_count",
          "recording_complete_count",
          "active_within_window",
        ]),
    }),
    defineField({
      name: "minProgressCount",
      title: "Minimum progress count",
      type: "number",
      validation: (rule) => rule.min(0),
      hidden: ({ parent }) =>
        hiddenUnlessMode(parent, ["active_within_window"]),
    }),
    defineField({
      name: "minContributionCount",
      title: "Minimum contribution count",
      type: "number",
      validation: (rule) => rule.min(0),
      hidden: ({ parent }) =>
        hiddenUnlessMode(parent, ["exegesis_contribution_count"]),
    }),
    defineField({
      name: "minVoteCount",
      title: "Minimum vote count",
      type: "number",
      validation: (rule) => rule.min(0),
      hidden: ({ parent }) => hiddenUnlessMode(parent, ["exegesis_vote_tally"]),
    }),
    defineField({
      name: "joinedOnOrAfter",
      title: "Joined on or after",
      type: "datetime",
      hidden: ({ parent }) =>
        hiddenUnlessMode(parent, ["joined_within_window"]),
    }),
    defineField({
      name: "joinedBefore",
      title: "Joined before",
      type: "datetime",
      hidden: ({ parent }) =>
        hiddenUnlessMode(parent, ["joined_within_window"]),
    }),
    defineField({
      name: "activeOnOrAfter",
      title: "Active on or after",
      type: "datetime",
      hidden: ({ parent }) =>
        hiddenUnlessMode(parent, ["active_within_window"]),
    }),
    defineField({
      name: "activeBefore",
      title: "Active before",
      type: "datetime",
      hidden: ({ parent }) =>
        hiddenUnlessMode(parent, ["active_within_window"]),
    }),
    defineField({
      name: "internalNote",
      title: "Internal note",
      type: "text",
      rows: 4,
    }),
  ],
  orderings: [
    {
      title: "Display order",
      name: "displayOrderAsc",
      by: [
        { field: "displayOrder", direction: "asc" },
        { field: "title", direction: "asc" },
      ],
    },
  ],
  preview: {
    select: {
      title: "title",
      keySuffix: "keySuffix",
      media: "image",
      active: "active",
      undisclosed: "undisclosed",
    },
    prepare(selection) {
      const title =
        typeof selection.title === "string" && selection.title.trim()
          ? selection.title.trim()
          : "Untitled badge";

      const entitlementKey =
        typeof selection.keySuffix === "string" && selection.keySuffix.trim()
          ? `badge_${selection.keySuffix.trim()}`
          : "No entitlement key";

      const stateBits = [
        selection.active === false ? "inactive" : null,
        selection.undisclosed === true ? "undisclosed" : null,
      ].filter((value): value is string => Boolean(value));

      return {
        title,
        subtitle:
          stateBits.length > 0
            ? `${entitlementKey} · ${stateBits.join(" · ")}`
            : entitlementKey,
        media: selection.media,
      };
    },
  },
});