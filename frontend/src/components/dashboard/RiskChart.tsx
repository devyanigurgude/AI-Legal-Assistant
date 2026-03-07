import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface RiskChartProps {
  chartData: Array<{
    name: string;
    value: number;
  }>;
}

export default function RiskChart({ chartData }: RiskChartProps) {
  const data = chartData.map((entry) => {
    const normalized = entry.name.toLowerCase();
    let fill = "hsl(var(--accent))";

    if (normalized.includes("high")) fill = "hsl(var(--destructive))";
    else if (normalized.includes("medium")) fill = "hsl(var(--risk-medium))";
    else if (normalized.includes("low")) fill = "hsl(var(--risk-low))";

    return { ...entry, fill };
  });

  return (
    <Card className="rounded-xl border bg-card shadow-sm hover:shadow-lg transition-all duration-200">
      <CardHeader>
        <CardTitle className="text-base font-display flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-accent" />
          Risk Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
