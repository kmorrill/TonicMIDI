import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Find all HTML files in the demo directory
async function generateInputs() {
  const htmlFiles = await glob('**/*.html', { 
    cwd: resolve(__dirname, 'demo'),
    ignore: ['dist/**']
  });

  // Create input object for rollup
  const input = {};
  htmlFiles.forEach(file => {
    // Use the file path without extension as the entry point name to preserve directory structure
    const name = file.replace('.html', '');
    input[name] = resolve(__dirname, 'demo', file);
  });
  
  return input;
}

export default defineConfig(async () => {
  const input = await generateInputs();
  
  return {
    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        input,
        // Allow eval in the build
        output: {
          format: 'es'
        }
      },
      target: 'esnext', // Support top-level await
      sourcemap: true, // Add source maps for debugging
      minify: false, // Disable minification to better handle eval
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1000
    },
    esbuild: {
      target: 'esnext', // Support top-level await
      supported: {
        'top-level-await': true // Add specific support for top-level await
      },
      logOverride: {
        'unsupported-dynamic-import': 'silent',
        'unsupported-jsx-comment': 'silent',
        'eval-is-discouraged': 'silent'
      }
    },
    root: resolve(__dirname, 'demo'),
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext', // Support top-level await
        supported: {
          'top-level-await': true // Add specific support for top-level await
        }
      }
    }
  };
});