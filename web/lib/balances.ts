"use client";

/** MON, USDC and (testnet) sandbox MockUSDC balances of the signed-in account (playbook D-1.5). Polls every 15 s. */
import { useQuery } from "@tanstack/react-query";
import { erc20Abi } from "@/lib/abi";
import { publicClient } from "@/lib/chains";
import { ADDR, NETWORK, USDC } from "@/lib/network";
import { useAuth } from "@/lib/auth";

export interface Balances {
  /** wei */
  mon: bigint;
  /** USDC units (6 decimals) */
  usdc: bigint;
  /** testnet MockUSDC from the judge sandbox (6 decimals); 0 where there is none */
  testUsdc: bigint;
}

export function useBalances() {
  const { address, isMock } = useAuth();
  return useQuery({
    queryKey: ["balances", NETWORK, address],
    enabled: !!address && !isMock,
    refetchInterval: 15_000,
    queryFn: async (): Promise<Balances> => {
      const client = publicClient();
      const mock = ADDR.mockUsdc as `0x${string}` | null;
      const [mon, usdc, testUsdc] = await Promise.all([
        client.getBalance({ address: address! }),
        client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address!] }),
        mock ? client.readContract({ address: mock, abi: erc20Abi, functionName: "balanceOf", args: [address!] }) : 0n,
      ]);
      return { mon, usdc, testUsdc };
    },
  });
}
