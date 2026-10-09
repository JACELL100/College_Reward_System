"use client";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { authErrorMessage, updatePassword } from "@/lib/supabase";

export function ChangePasswordCard() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const weak = pw.length > 0 && (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw));
  const mismatch = confirm.length > 0 && confirm !== pw;
  const canSave = pw.length > 0 && !weak && confirm === pw;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    try {
      await updatePassword(pw);
      setPw("");
      setConfirm("");
      toast.success("Password updated");
    } catch (x) {
      toast.error(authErrorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Change password" description="Used to sign in with your email." icon={<KeyRound className="size-4" />} />
      <CardBody>
        <form onSubmit={save} className="space-y-4">
          <Field label="New password" htmlFor="new-pw" error={weak ? "Use 8+ characters with letters and numbers" : undefined}>
            <Input id="new-pw" type="password" autoComplete="new-password" value={pw} maxLength={72} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-pw" error={mismatch ? "Passwords don't match" : undefined}>
            <Input id="confirm-pw" type="password" autoComplete="new-password" value={confirm} maxLength={72} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={!canSave}>
              Update password
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
