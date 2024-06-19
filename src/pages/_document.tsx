// src/pages/_document.tsx
import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <meta charSet="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <meta
            httpEquiv="Content-Security-Policy"
            content="
            default-src 'self';
            script-src 'self' 'unsafe-eval' 'unsafe-inline' https://static.line-scdn.net https://liffsdk.line-scdn.net;
            style-src 'self' 'unsafe-inline' https://static.line-scdn.net https://liffsdk.line-scdn.net;
            img-src 'self' data: https://static.line-scdn.net https://liffsdk.line-scdn.net;
            connect-src 'self' https://static.line-scdn.net https://liffsdk.line-scdn.net https://api.line.me;
          "
          />
          <script>{`console.log("CSP Loaded");`}</script>
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
