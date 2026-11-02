"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { EmptyState, PageContainer } from "@/components/layout/page";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <PageContainer>
      <EmptyState
        icon={AlertTriangle}
        title="This page couldn’t load"
        description="Your data is safe. Try again, and if it keeps happening, reload the app."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </PageContainer>
  );
}
