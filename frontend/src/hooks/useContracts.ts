import { useCallback, useEffect, useState } from "react";
import { listContracts } from "@/services/apiService";
import type { Contract } from "@/types/api";

interface UseContractsOptions {
  autoSelectFirst?: boolean;
}

export function useContracts(options?: UseContractsOptions) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string>();

  const refreshContracts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listContracts();
      const safeContracts = Array.isArray(data) ? data : [];
      setContracts(safeContracts);

      if (options?.autoSelectFirst && safeContracts.length > 0) {
        setSelectedId((prev) => {
          if (prev && safeContracts.some((contract) => contract.id === prev)) return prev;
          return safeContracts[0]?.id;
        });
      } else {
        setSelectedId((prev) => (prev && safeContracts.some((contract) => contract.id === prev) ? prev : undefined));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch contracts.";
      setError(message);
      setContracts([]);
      setSelectedId(undefined);
    } finally {
      setLoading(false);
    }
  }, [options?.autoSelectFirst]);

  useEffect(() => {
    refreshContracts();
  }, [refreshContracts]);

  return {
    contracts,
    loading,
    error,
    selectedId,
    setSelectedId,
    refreshContracts,
  };
}
