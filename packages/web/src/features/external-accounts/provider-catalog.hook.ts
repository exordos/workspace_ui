import { useEffect, useMemo, useState } from "react";
import { fetchWorkspaceProviders } from "./external-accounts.api";
import type { ExternalAccountType, WorkspaceProvider } from "./external-accounts.types";

export interface ProviderCatalogState {
  providers: WorkspaceProvider[];
  loading: boolean;
  failed: boolean;
}

const EMPTY_PROVIDERS: WorkspaceProvider[] = [];

export function useProviderCatalog(kind: ExternalAccountType): ProviderCatalogState {
  const [providers, setProviders] = useState<WorkspaceProvider[]>(EMPTY_PROVIDERS);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchWorkspaceProviders(controller.signal)
      .then((catalog) => {
        if (controller.signal.aborted) return;
        setProviders(catalog);
        setFailed(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setProviders(EMPTY_PROVIDERS);
        setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const compatibleProviders = useMemo(
    () => providers.filter((provider) => provider.supportedKinds.includes(kind)),
    [kind, providers],
  );
  return { providers: compatibleProviders, loading, failed };
}
