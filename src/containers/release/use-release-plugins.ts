import { useEffect, useState } from 'react';
import { type ReleasePlugin, releasePlugins } from 'src/api/release';
import { plugin_versions } from 'src/utilities';

// the release-capable plugins installed on this Pulp; null until known
export function useReleasePlugins(): ReleasePlugin[] | null {
  const [plugins, setPlugins] = useState<ReleasePlugin[]>(null);

  useEffect(() => {
    plugin_versions()
      .then((versions) => {
        const installed = new Set(versions.map(({ name }) => name));
        setPlugins(
          (Object.keys(releasePlugins) as ReleasePlugin[]).filter((plugin) =>
            installed.has(plugin),
          ),
        );
      })
      .catch(() => setPlugins([]));
  }, []);

  return plugins;
}
