"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { decodeTxError, isUserRejection } from "@/lib/chain";
import type { Profile } from "@/lib/types";
import { useAuth } from "./auth-provider";
import { useWallet } from "./wallet-provider";

export function useLinkWallet() {
  const { setProfile, profile } = useAuth();
  const { address, connect, signMessage } = useWallet();
  const [linking, setLinking] = useState(false);

  const link = useCallback(async () => {
    setLinking(true);
    try {
      const a = address ?? (await connect());
      if (!a) return false;
      const { message } = await api.get<{ message: string }>("/api/wallet/link-message");
      let signature: string;
      try {
        signature = await signMessage(message);
      } catch (e) {
        toast.error(isUserRejection(e) ? "Signature request rejected" : decodeTxError(e));
        return false;
      }
      const p = await api.post<Profile>("/api/wallet/link", { address: a, message, signature });
      setProfile(p);
      toast.success("Wallet linked to your account", { description: "Signed with personal_sign, no gas used." });
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setLinking(false);
    }
  }, [address, connect, signMessage, setProfile]);

  const unlink = useCallback(async () => {
    setLinking(true);
    try {
      const p = await api.del<Profile>("/api/wallet/link");
      setProfile(p);
      toast.success("Wallet unlinked");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLinking(false);
    }
  }, [setProfile]);

  const linked = profile?.wallet_address?.toLowerCase() ?? null;
  const mismatch = Boolean(linked && address && linked !== address);
  return { link, unlink, linking, linked, mismatch };
}
