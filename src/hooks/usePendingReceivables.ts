import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { applyTenantFilter } from "@/lib/tenant";

export function usePendingReceivablesCount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: count = 0 } = useQuery({
    queryKey: ["pendingReceivablesCount", user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const query = applyTenantFilter(
        supabase
          .from('transaction_payments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
      );

      const { count, error } = await query;
      if (error || count === null) return 0;
      return count;
    },
    enabled: !!user,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!user) return;

    const channelName = `receivables_sidebar_${Math.random().toString(36).substring(7)}`;
    const subscription = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transaction_payments" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["pendingReceivablesCount"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user, queryClient]);

  return count;
}
