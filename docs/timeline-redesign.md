# Journal timeline redesign

Status: first implementation slice completed, 2026-10-01. Visual direction,
full inline notes and the subsequent attachment repository extension are approved.
Device visual review, including long notes, remains outstanding.

Visual refinement: month/day headings use secondary text color to distinguish
them from muted event times and significance labels. Expanded entries use a
subtle theme surface with softly rounded corners and inset space, keeping the
text's left alignment and the thread outside the highlighted region.

## Goal and example

Replace the repeated card layout with a journal connected by a quiet vertical
thread. Typography and spacing primarily express significance; category color
and category names connect related events. An everyday event such as “Coffee with Adil” stays compact, a major
achievement has a larger title and excerpt, and a turning point has the strongest
typographic emphasis. Images support rather than dominate that hierarchy.

Agreed direction:

- Borderless entries, a continuous visual thread, month context and day groups.
- Explicit event times when present; no invented time for date-only events.
- Category colors and names, without category icons.
- Retain @people, #tags and the location pin.
- Search, filter sheet, removable active filters and matching count above entries.
- Photos within the content column, with bounded preview sizes.
- Defer thread scrubbing and other new time-navigation gestures.

The mockup used simplified significance labels and filters. Production retains
Ordinary, Notable, Major and Turning point, and all existing filter capabilities.

## Flow

1. Load the existing paginated timeline; display month context and grouped dates.
2. Scroll normally through entries. Spacing follows significance, not elapsed time.
3. Tap an entry to open its detail; expand inline to reveal all metadata and load full notes on demand. Long notes flow in the main list, with collapse controls above and below; no nested scrolling.
4. Tap an attachment preview to open the existing viewer; closing returns to the
   same timeline position. Load the full attachment list only on demand.
5. Search or change existing filters; update entries and count together. Clearing
   chips keeps existing group-clearing semantics. Preserve the current sheet's
   dismissal/application behavior, rather than copying the mockup's simplified form.
6. Retain refresh, pagination, create, long-press selection, bulk actions, swipe
   deletion, deletion confirmation/undo where supported, and conflict indicators.
7. Preserve loading, retry and empty states. Missing or failed images keep a
   bounded unavailable state; viewer loading failures are retryable/dismissible.

## Responsibilities

- React Native SectionList owns virtualization, sticky headers and list lifecycle.
- Existing image and attachment components own image rendering and viewing.
- Existing query/repository layer owns filtering, ordering, pagination and counts.
- Our timeline components own date presentation, connected thread segments,
  significance styles, preview bounds and interaction coordination.
- Draw the thread in row/header segments outside swiping content, so it remains
  aligned during swipe, selection, expansion and virtualization. No full-list canvas.

## Choices

- Keep SectionList and current day grouping; add month context at boundaries.
  This avoids a new list dependency and keeps memory proportional to loaded pages.
  Check continuity when pagination splits a day or month and sticky headers move.
- Keep Instrument Sans and current theme tokens. Local timeline typography changes
  avoid changing other screens. Serif typography remains an optional later choice.
- Replace borders, category stripes and significance bars with type, spacing and
  restrained node treatments. Provide accessible significance labels.
- First slice uses the existing single attachmentPreview and attachmentCount.
  This avoids repository changes while validating the visual hierarchy.
- The complete photo-strip treatment needs a bounded list of previews (proposed:
  at most two per event, then a remaining-count affordance). Current EventListItem
  only supplies one. Fetch metadata in the paginated repository path, not a query
  per visible row. This adds bounded metadata/image-decoding work but no new stored
  data or disk cache architecture. Full-resolution viewing stays on demand.
- Full inline notes are approved. Keep notesPreview in list responses; mount an
  on-demand record query when expanded, using the existing query cache. Show
  loading, retry and unavailable states. Full Markdown notes flow in the main list;
  unmount the reader on collapse. Very long notes require device layout review.

## Interface

Illustrative boundaries, not a requirement to rename every existing component:

```ts
buildTimelineSections(items: EventListItem[]): TimelineDaySection[];
// Existing ordering, date grouping and month-boundary presentation metadata.

getTimelinePresentation(significance: EventSignificance): TimelinePresentation;
// Title size, spacing, excerpt limits, node style and image bounds for four levels.

TimelineEntry(props: TimelineEntryProps): React.ReactElement;
// Existing open/select/swipe/conflict behavior plus journal presentation.

TimelineAttachmentPreview(props: TimelineAttachmentPreviewProps): React.ReactElement;
// Bounded previews/count, unavailable state and explicit open callback.
```

The full-strip slice would extend EventListItem with a bounded preview collection;
the repository extension is approved for the subsequent photo-strip slice.

## First implementation slice

Build the thread, month/day headers and all four significance treatments in the
existing list. Reposition time/category/people/tags/location, show short excerpts,
and use the existing single attachment preview. Keep the current filter behavior
and actions operational. This is a review checkpoint, not the finished redesign.

Then align header/chip/count styling and complete bounded attachment strips plus
viewer integration using the approved repository extension.

Verify sparse and crowded entries, long titles, all four significance levels,
missing category/time/attachments, large text, narrow screens, light/dark themes,
selection, swipe, expansion, conflicts, filter clearing and page boundaries.
Use focused behavior tests for changed interactions/grouping and repository tests
if the preview contract changes; visually review the screen on the mobile target.

## Open choices and recommendations

- Four-level hierarchy: keep existing names and distinguish every level, rather
  than the mockup's three levels. Recommend subtle Ordinary/Notable distinction,
  stronger Major/Turning point jumps.
- Photo strip: recommend two previews plus remaining count, with larger bounded
  previews only for higher significance. Repository extension approved.
- Expansion: full metadata and full notes inline approved; long-note visual review
  remains open. Include lazy notes loading in the first slice.
- Date headers: retain existing Today/Yesterday conveniences with month/year
  context, while checking older years are unambiguous.

First slice implements the journal layout, stable day keys, non-clipped rows,
full metadata expansion and lazy full notes with top/bottom collapse controls.
The subsequent attachment slice now supplies two bounded previews and opens
the existing viewer on demand. Expanded-card margins removed by the user remain
unchanged.

## List investigation (first slice)

Keep SectionList for now. The current day sections lack stable keys; add date keys
to prevent index-based section identity shifts on filtering/insertion/deletion.
Disable removeClippedSubviews for dynamic-height entries (higher native view
retention within the virtualization window, no extra disk use). Remove initial
unbounded title layout before truncation. These address concrete risks, not a
confirmed reproduction of the reported transient missing rows. FlatList shares
VirtualizedList and is not inherently a fix. Defer replacing the list engine until
reproduction/profiling justifies the extra dependency or custom header logic.

## Attachment slice (approved)

Replace singular attachmentPreview with attachmentPreviews (maximum two, ordered
by sortOrder then id, excluding deleted attachments) in both repositories. SQLite
keeps one list query using a bounded JSON subquery. Count remains the total.
Thumbnail taps mount an on-demand attachment query and the existing viewer;
resolve the initial image by ID so reordering cannot select the wrong image.
Loading and failure are dismissible; failures offer retry. Selection mode routes
thumbnail taps to event selection instead. No migration or new image cache.

Attachment validation covers zero/one/many previews, stable sort-order ties,
deleted files, one SQLite query per page, viewer loading/cancellation/retry,
and resolving the tapped image after reordering. Native visual review remains
outstanding.

## Header/filter polish (approved)

Keep the logo, overflow menu, fixed header placement and all existing filter
controls/semantics. Do not add a timeline title. Soften search and active chips,
quiet the Filters button, retain its active-group badge, and display the existing
count query result beneath controls (with loading/updating/unavailable wording).
Refine sheet spacing/headings and use high-contrast selected options. No new
queries, filter types, gestures, or changes to chip clearing and sheet dismissal.
