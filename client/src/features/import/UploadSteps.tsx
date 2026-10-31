import { CheckIcon } from 'phosphor-react-native';
import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { DisplayText } from '../../ui/components';
import { color } from '../../ui/theme';
import { getUploadSteps, type UploadProgressStage } from './uploadStages';

export function UploadSteps({
  stage,
  paused = false,
}: {
  stage: UploadProgressStage;
  paused?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const steps = getUploadSteps(stage);
  if (!steps) return null;
  const stacked = fontScale > 1.3;
  const stateLabels = {
    complete: 'завершено',
    current: 'текущий этап',
    error: 'ошибка',
    pending: 'ожидается',
  };
  return (
    <View
      accessible
      accessibilityLabel={steps
        .map(
          step =>
            `${step.label}: ${paused && step.state === 'current' ? 'проверка приостановлена' : stateLabels[step.state]}`,
        )
        .join('. ')}
      style={[stepStyles.steps, stacked && stepStyles.stacked]}
    >
      {steps.map((step, index) => (
        <View
          key={step.label}
          style={[stepStyles.step, stacked && stepStyles.stackedStep]}
        >
          <View
            style={[
              stepStyles.dot,
              step.state === 'complete' && stepStyles.complete,
              step.state === 'current' && !paused && stepStyles.current,
              step.state === 'error' && stepStyles.error,
            ]}
          >
            {step.state === 'complete' ? (
              <CheckIcon
                size={14}
                weight="bold"
                color={color.ink}
              />
            ) : (
              <DisplayText
                style={[stepStyles.number, step.state === 'pending' && stepStyles.muted]}
              >
                {step.state === 'error' ? '!' : index + 1}
              </DisplayText>
            )}
          </View>
          <Text style={[stepStyles.label, step.state === 'pending' && stepStyles.muted]}>
            {step.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  steps: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: 22,
    gap: 10,
  },
  stacked: { flexDirection: 'column', gap: 16 },
  step: { flex: 1, alignItems: 'center', gap: 8 },
  stackedStep: { flex: 0, flexDirection: 'row', gap: 12 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  complete: { backgroundColor: color.accent, borderColor: color.accent },
  current: { backgroundColor: color.accentSoft, borderColor: '#A7CD83' },
  error: { backgroundColor: color.dangerSoft, borderColor: color.dangerLine },
  number: { fontSize: 12, fontWeight: '600', color: color.ink },
  label: { fontSize: 12, lineHeight: 18, fontWeight: '500', color: color.ink, flexShrink: 1 },
  muted: { color: color.muted },
});
