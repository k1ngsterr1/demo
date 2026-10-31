import { ReceiptIcon, XIcon } from 'phosphor-react-native';
import React, { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type TextProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, styles } from './theme';

/** Large display type grows moderately; body text and actions retain full Dynamic Type. */
export function DisplayText(props: TextProps) {
  return (
    <Text
      maxFontSizeMultiplier={1.25}
      {...props}
    />
  );
}

export function Button({
  title,
  label = title,
  onPress,
  disabled,
  dimWhenDisabled = true,
  secondary,
  danger,
  icon,
}: {
  title: string;
  label?: string;
  onPress(): void;
  disabled?: boolean;
  dimWhenDisabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        danger && styles.danger,
        disabled ? dimWhenDisabled && styles.disabled : pressed && styles.pressed,
      ]}
    >
      {icon && (
        <View
          style={styles.controlIcon}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {icon}
        </View>
      )}
      <Text style={[styles.buttonText, danger && styles.dangerText]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  label,
  onPress,
  disabled,
  dimWhenDisabled = true,
  busy = false,
  children,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  dimWhenDisabled?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        disabled ? dimWhenDisabled && styles.disabled : pressed && styles.pressed,
      ]}
    >
      <View
        style={styles.controlIcon}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {children}
      </View>
    </Pressable>
  );
}

export function IconTile({
  children,
  size = 'large',
  accent = false,
}: {
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
  accent?: boolean;
}) {
  return (
    <View
      style={[
        styles.iconTile,
        size === 'small'
          ? styles.iconTileSmall
          : size === 'medium'
            ? styles.iconTileMedium
            : styles.iconTileLarge,
        accent && styles.iconTileAccent,
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {children}
    </View>
  );
}

export function Brand() {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 390 || fontScale > 1.3;
  return (
    <View
      style={styles.brand}
      accessible
      accessibilityLabel="Statement Import"
    >
      <IconTile
        size="small"
        accent
      >
        <ReceiptIcon
          size={24}
          color={color.ink}
        />
      </IconTile>
      <DisplayText style={styles.brandName}>
        {compact ? 'Statement\nImport' : 'Statement Import'}
      </DisplayText>
    </View>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/** Presentation and dismissal belong to navigation; this component only lays out content. */
export function SheetLayout({
  onClose,
  closeLabel,
  title,
  eyebrow,
  keyboardAvoiding = false,
  children,
}: {
  onClose(): void;
  closeLabel: string;
  title: string;
  eyebrow?: string;
  keyboardAvoiding?: boolean;
  children: ReactNode;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stackedHeading = width < 390 || fontScale > 1.3;
  const content = (
    <ScrollView
      contentContainerStyle={[styles.page, styles.sheetPage]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.sheetHeading, stackedHeading && styles.sheetHeadingStacked]}>
        <View style={[styles.heading, styles.flex]}>
          {eyebrow && <Text style={styles.muted}>{eyebrow}</Text>}
          <DisplayText
            accessibilityRole="header"
            style={styles.title}
          >
            {title}
          </DisplayText>
        </View>
        <View style={styles.sheetClose}>
          <IconButton
            label={closeLabel}
            onPress={onClose}
          >
            <XIcon
              size={22}
              color={color.ink}
            />
          </IconButton>
        </View>
      </View>
      {children}
    </ScrollView>
  );
  return (
    <SafeAreaView style={styles.safe}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
