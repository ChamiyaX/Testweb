/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export', // Enable static export for Netlify
    images: {
        unoptimized: true, // Required for static export
    },
    typescript: {
        // Ignore all TypeScript errors during build
        ignoreBuildErrors: true,
    },
    eslint: {
        // Ignore all ESLint errors during build
        ignoreDuringBuilds: true,
    },
    webpack: (config, { isServer }) => {
        // Handle onnxruntime and other node modules that should only run on client
        if (isServer) {
            // For server-side builds, we want to mark these modules as external
            // so they don't get bundled in the server build
            config.externals = [...(config.externals || []),
                'onnxruntime-web',
                'onnxruntime-web/webgpu',
                'sharp',
                'onnxruntime-node'
            ];
        } else {
            // For client-side builds, we need to handle these modules
            config.resolve.alias = {
                ...config.resolve.alias,
                sharp$: false,
                "onnxruntime-node$": false,
            };
        }

        return config;
    },
    // Add Turbopack configuration
    experimental: {
        turbo: {
            resolveAlias: {
                // For Turbopack, we need to use empty strings instead of false
                sharp: "",
                "onnxruntime-node": "",
            },
        },
    },
};

module.exports = nextConfig;