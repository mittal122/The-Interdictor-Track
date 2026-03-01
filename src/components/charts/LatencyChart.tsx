import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function LatencyChart({ currentLatency }: { currentLatency: number }) {
  const [data, setData] = useState<{ time: string; latency: number }[]>([]);

  useEffect(() => {
    setData((prev) => {
      const now = new Date();
      const timeStr = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
      const newData = [...prev, { time: timeStr, latency: currentLatency }];
      if (newData.length > 20) {
        return newData.slice(newData.length - 20);
      }
      return newData;
    });
  }, [currentLatency]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="time"
          stroke="#52525b"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => value.split(":")[2]}
        />
        <YAxis
          stroke="#52525b"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          domain={[0, 150]}
          tickFormatter={(value) => `${value}ms`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "6px",
            fontSize: "12px",
            color: "#e4e4e7",
          }}
          itemStyle={{ color: "#3b82f6" }}
        />
        <Line
          type="monotone"
          dataKey="latency"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#3b82f6", stroke: "#18181b", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
