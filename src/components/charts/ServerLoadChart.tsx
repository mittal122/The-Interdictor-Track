import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

export function ServerLoadChart({ data }: { data: { region: string; load: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="region"
          stroke="#52525b"
          fontSize={10}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#52525b"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          domain={[0, 100]}
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip
          cursor={{ fill: "#27272a", opacity: 0.4 }}
          contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "6px",
            fontSize: "12px",
            color: "#e4e4e7",
          }}
          itemStyle={{ color: "#e4e4e7" }}
          formatter={(value: number) => [`${value.toFixed(1)}%`, "Load"]}
        />
        <Bar dataKey="load" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                entry.load > 85
                  ? "#ef4444" // red
                  : entry.load > 70
                  ? "#eab308" // yellow
                  : "#10b981" // emerald
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
