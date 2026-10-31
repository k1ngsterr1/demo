import React, { createContext, useContext, type ReactNode } from 'react';
import { getImportPresentation } from './presentation';
import type { ImportServices } from './services';
import { useImportFlow } from './useImportFlow';

type ImportFlowValue = ReturnType<typeof useImportFlow> & {
  view: ReturnType<typeof getImportPresentation>;
  reduceMotion: boolean;
  foreground: boolean;
};
const ImportFlowContext = createContext<ImportFlowValue | null>(null);

/** One controller owner above both stacks; changing screens never reboots the flow. */
export function ImportFlowProvider({
  services,
  foreground,
  reduceMotion,
  children,
}: {
  services: ImportServices;
  foreground: boolean;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  const flow = useImportFlow(services, foreground);
  const view = getImportPresentation(flow.state, flow.picking, flow.localFault);
  return (
    <ImportFlowContext.Provider value={{ ...flow, view, reduceMotion, foreground }}>
      {children}
    </ImportFlowContext.Provider>
  );
}

export function useImport() {
  const value = useContext(ImportFlowContext);
  if (!value) {
    throw new Error('Import screens require ImportFlowProvider');
  }
  return value;
}
