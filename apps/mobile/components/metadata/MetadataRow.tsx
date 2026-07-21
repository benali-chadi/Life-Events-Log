import { useTheme } from '@lel/design/useTheme';
import { Text, View } from 'react-native';
import { ReactNode } from 'react';
import { radius, spacing } from '@lel/design';

interface MetadataRowProps {
  label: string;
  labelElement: ReactNode;
  labelIcon?: ReactNode;
}

export default function MetadataRow({
  label,
  labelElement,
  labelIcon,
}: MetadataRowProps) {
  const { colors } = useTheme();

  return (
    <View style={{ flexDirection: 'row' }}>
      <View
        style={{
          paddingVertical: spacing[3],
          paddingHorizontal: spacing[2],
          borderColor: colors.border,
          borderWidth: 1,
          width: '30%',

          borderTopLeftRadius: radius.sm,
          borderBottomLeftRadius: radius.sm,

          flexDirection: 'row',
          gap: spacing[1],
          alignItems: 'center',
        }}
      >
        {labelIcon}
        <Text
          style={{
            color: colors.text,
          }}
        >
          {label}
        </Text>
      </View>
      <View
        style={{
          // paddingVertical: spacing[3],
          // paddingHorizontal: spacing[2],
          borderColor: colors.border,
          borderWidth: 1,
          borderLeftWidth: 0,
          width: '70%',

          borderTopLeftRadius: radius.sm,
          borderBottomLeftRadius: radius.sm,
        }}
      >
        {labelElement}
      </View>
    </View>
  );
}
