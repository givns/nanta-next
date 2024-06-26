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
              default-src *;
              script-src * 'unsafe-inline' 'unsafe-eval';
              style-src * 'unsafe-inline';
              img-src * data: blob:;
              font-src * data:;
              connect-src *;
              media-src *;
              object-src *;
              child-src *;
              frame-src *;
              worker-src *;
              form-action *;
              base-uri *;
              manifest-src *;
              prefetch-src *;
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
