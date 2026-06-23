/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ignored: [
          "**/.git/**",
          "**/.next/**",
          "**/.superpowers/**",
          "**/node_modules/**",
        ],
      };
    }
    return config;
  },
};
export default nextConfig;
