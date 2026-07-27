import { radius, spacing, typography } from '@lel/design';
import { StyleSheet } from 'react-native';

export const eventCardStyles = StyleSheet.create({
  deleteAction: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.sm,
    backgroundColor: '#B42318',
  },
  deleteText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  card: {
    minHeight: 50,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.sm,
    gap: spacing[2],
  },
  ordinaryCard: {
    padding: spacing[2],
  },
  notableCard: {
    padding: 10,
  },
  majorCard: {
    padding: spacing[3],
    gap: spacing[3],
  },
  turningPointCard: {
    padding: spacing[4],
    gap: spacing[3],
  },
  turningPointInnerBorder: {
    position: 'absolute',
    top: 4,
    right: 4,
    bottom: 4,
    left: 8,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[2],
    alignItems: 'flex-start',
  },
  title: {
    flex: 1,
  },
  ordinaryTitle: {
    ...typography.body,
  },
  notableTitle: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '500',
  },
  majorTitle: {
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '600',
  },
  turningPointTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
  },
  headerMeta: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: spacing[1],
  },
  date: {
    ...typography.caption,
  },
  significanceMarker: {
    height: 3,
    flexDirection: 'row',
    gap: 2,
  },
  significanceSegment: {
    width: 8,
    height: 2,
    borderRadius: 1,
  },
  previewRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  metadataValues: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  metadataText: {
    ...typography.caption,
  },
  expandButton: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[1],
  },
  expandText: {
    ...typography.caption,
  },
  expandedContent: {
    borderTopWidth: 1,
    paddingTop: spacing[2],
    gap: spacing[1],
  },
  detailRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  detailLabel: {
    ...typography.caption,
    width: 80,
  },
  detailValue: {
    ...typography.caption,
    flex: 1,
  },
  notes: {
    ...typography.small,
    marginTop: spacing[1],
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  locationText: {
    ...typography.caption,
  },
});
