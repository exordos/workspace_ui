const WEB_PORT = process.env.WORKSPACE_WEB_PORT ?? "4173";
const WEB_HOST = process.env.WORKSPACE_WEB_HOST ?? "0.0.0.0";

module.exports = {
  apps: [
    {
      name: "workspace-web",
      cwd: __dirname,
      script: "npm",
      args: [
        "run",
        "preview",
        "--workspace=web",
        "--",
        "--host",
        WEB_HOST,
        "--port",
        WEB_PORT,
        "--strictPort",
      ],
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        VITE_PWA_DEV: "false",
      },
    },
  ],
};
