if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

export const appConfig = {
  port: parseInt(process.env.PORT ?? '3000'),
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
  proxy: {
    timeout: parseInt(process.env.PROXY_TIMEOUT ?? '5000'),
  },
};
