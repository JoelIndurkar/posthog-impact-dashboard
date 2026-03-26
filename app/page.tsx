import { readFile } from "fs/promises";
import path from "path";
import { DashboardData } from "./types";
import Dashboard from "./components/Dashboard";

export default async function Home() {
  const filePath = path.join(process.cwd(), "public", "dashboard-data.json");
  const raw = await readFile(filePath, "utf-8");
  const data: DashboardData = JSON.parse(raw);
  return <Dashboard data={data} />;
}
