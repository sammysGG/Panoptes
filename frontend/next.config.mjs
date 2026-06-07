/** @type {import('next').NextConfig} */
const config = {
  // Lint is run separately (`yarn lint`); the template ships strict stylistic
  // rules (eslint-plugin-unicorn) that shouldn't block production builds.
  eslint: { ignoreDuringBuilds: true },
};

export default config;
