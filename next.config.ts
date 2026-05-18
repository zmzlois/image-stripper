import type { NextConfig } from "next";
import { validateEnv } from "./lib/env";

validateEnv();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
