import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  toneClass?: string;
}

export default function StatsCard({ label, value, icon: Icon, toneClass }: StatsCardProps) {
  return (
    <Card className="rounded-xl border bg-card shadow-sm hover:shadow-lg transition-all duration-200">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-1">{value}</p>
          </div>
          <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${toneClass ?? "bg-accent/10"}`}>
            <Icon className="h-5 w-5 text-accent" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
