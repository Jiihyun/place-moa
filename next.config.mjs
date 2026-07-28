/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@libsql/client'],
  async rewrites() {
    return [{ source: '/proposal', destination: '/proposal.html' }];
  },
};
export default nextConfig;
