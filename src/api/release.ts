import { config } from 'src/ui-config';
import { waitForTaskUrl } from '../utilities/wait-for-task';
import { PulpAPI } from './pulp';

// A release is a named set of repository versions, e.g. HIVE-RELEASE. Pulp has
// no such object, so a release is stored as one distribution per repository,
// each pinned to a version and labelled release=<name>. Every distribution
// keeps serving exactly that version at <release>/<plugin>/<repository>, no
// matter what later syncs do to the repository.

export const RELEASE_LABEL = 'release';

export type ReleasePlugin = 'ansible' | 'deb' | 'file' | 'python' | 'rpm';

interface PluginConfig {
  title: string;
  repositories: string;
  distributions: string;
  // plugins whose distributions can only serve a publication; the others are
  // pinned with repository_version directly
  publications?: string;
  publicationData?: Record<string, unknown>;
}

export const releasePlugins: Record<ReleasePlugin, PluginConfig> = {
  ansible: {
    title: 'Ansible',
    repositories: 'repositories/ansible/ansible/',
    distributions: 'distributions/ansible/ansible/',
  },
  deb: {
    title: 'Deb',
    repositories: 'repositories/deb/apt/',
    distributions: 'distributions/deb/apt/',
    publications: 'publications/deb/apt/',
    publicationData: { structured: true },
  },
  file: {
    title: 'File',
    repositories: 'repositories/file/file/',
    distributions: 'distributions/file/file/',
    publications: 'publications/file/file/',
  },
  python: {
    title: 'Python',
    repositories: 'repositories/python/python/',
    distributions: 'distributions/python/pypi/',
    publications: 'publications/pypi/',
  },
  rpm: {
    title: 'RPM',
    repositories: 'repositories/rpm/rpm/',
    distributions: 'distributions/rpm/rpm/',
    publications: 'publications/rpm/rpm/',
  },
};

export interface ReleaseEntry {
  release: string;
  plugin: ReleasePlugin;
  distribution: {
    pulp_href: string;
    name: string;
    base_path: string;
    base_url?: string;
    client_url?: string;
    pulp_labels: Record<string, string>;
    pulp_created: string;
    pulp_last_updated?: string;
    publication?: string | null;
    repository_version?: string | null;
  };
  repositoryName: string | null;
  repositoryHref: string | null;
  versionHref: string | null;
  versionNumber: number | null;
}

const base = new PulpAPI();

// hrefs come back absolute (/pulp/api/v3/...), requests want them relative
const rel = (href: string) => href.replace(config.API_BASE_PATH, '');

// .../repositories/rpm/rpm/<uuid>/versions/<n>/
const repositoryOfVersion = (versionHref: string) =>
  versionHref.replace(/versions\/\d+\/$/, '');
const numberOfVersion = (versionHref: string) =>
  Number(versionHref.match(/versions\/(\d+)\/$/)?.[1] ?? NaN);

const listAll = (url: string, params = {}) => {
  const page = (offset, acc) =>
    base.http
      .get(url, { params: { ...params, offset, limit: 100 } })
      .then(({ data }) => {
        const results = [...acc, ...data.results];
        return data.next && results.length < data.count
          ? page(offset + 100, results)
          : results;
      });

  return page(0, []);
};

const waitForTask = (task: string) =>
  waitForTaskUrl(task, { waitMs: 1000, bailAfter: 15 });

export const releaseBasePath = (
  release: string,
  plugin: ReleasePlugin,
  repositoryName: string,
) => `${release.toLowerCase()}/${plugin}/${repositoryName}`;

// release names end up in base paths and labels
export const isValidReleaseName = (name: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);

function resolveEntries(
  plugin: ReleasePlugin,
  distributions,
): Promise<ReleaseEntry[]> {
  const repositoryNames = {};
  const publicationVersions = {};

  const cached = (cache, key, fetch) =>
    (cache[key] ??= fetch().catch(() => null));

  return Promise.all(
    distributions.map((distribution) =>
      (distribution.publication
        ? cached(publicationVersions, distribution.publication, () =>
            base.http
              .get(rel(distribution.publication))
              .then(({ data }) => data.repository_version),
          )
        : Promise.resolve(distribution.repository_version ?? null)
      ).then((versionHref) => {
        const repositoryHref = versionHref
          ? repositoryOfVersion(versionHref)
          : null;

        return (
          repositoryHref
            ? cached(repositoryNames, repositoryHref, () =>
                base.http
                  .get(rel(repositoryHref))
                  .then(({ data }) => data.name),
              )
            : Promise.resolve(null)
        ).then((repositoryName) => ({
          release: distribution.pulp_labels[RELEASE_LABEL],
          plugin,
          distribution,
          repositoryName,
          repositoryHref,
          versionHref,
          versionNumber: versionHref ? numberOfVersion(versionHref) : null,
        }));
      }),
    ),
  );
}

// the version's publication: an existing one if there is one, else a new one
function publicationFor(plugin: ReleasePlugin, versionHref: string) {
  const { publications, publicationData } = releasePlugins[plugin];

  return base.http
    .get(publications, {
      params: {
        repository_version: versionHref,
        ordering: '-pulp_created',
        limit: 1,
      },
    })
    .then(({ data }) =>
      data.results.length
        ? data.results[0].pulp_href
        : base.http
            .post(publications, {
              repository_version: versionHref,
              ...publicationData,
            })
            .then(({ data }) => waitForTask(data.task))
            .then((task) => task.created_resources[0]),
    );
}

export const ReleaseAPI = {
  // every entry of every release, or of one release; plugins not installed are skipped
  listEntries(plugins: ReleasePlugin[], release?: string) {
    const label = release ? `${RELEASE_LABEL}=${release}` : RELEASE_LABEL;

    return Promise.all(
      plugins.map((plugin) =>
        listAll(releasePlugins[plugin].distributions, {
          pulp_label_select: label,
        }).then((distributions) => resolveEntries(plugin, distributions)),
      ),
    ).then((lists) =>
      lists
        .flat()
        .sort(
          (a, b) =>
            a.release.localeCompare(b.release) ||
            a.plugin.localeCompare(b.plugin) ||
            a.distribution.base_path.localeCompare(b.distribution.base_path),
        ),
    );
  },

  listRepositories(plugin: ReleasePlugin) {
    return listAll(releasePlugins[plugin].repositories, {
      ordering: 'name',
      fields: 'pulp_href,name,latest_version_href',
    });
  },

  listVersions(repositoryHref: string) {
    return listAll(`${rel(repositoryHref)}versions/`, {
      ordering: '-number',
      fields: 'pulp_href,number,pulp_created',
    });
  },

  // point <release>'s distribution for this repository at versionHref,
  // creating the distribution the first time
  pin(
    release: string,
    plugin: ReleasePlugin,
    repositoryName: string,
    versionHref: string,
  ) {
    const { distributions, publications } = releasePlugins[plugin];
    const base_path = releaseBasePath(release, plugin, repositoryName);

    return Promise.all([
      base.http
        .get(distributions, { params: { base_path, limit: 1 } })
        .then(({ data }) => data.results[0] ?? null),
      publications ? publicationFor(plugin, versionHref) : null,
    ]).then(([existing, publication]) => {
      if (existing && existing.pulp_labels?.[RELEASE_LABEL] !== release) {
        return Promise.reject(
          new Error(
            `Base path "${base_path}" is already used by distribution "${existing.name}", which is not part of release "${release}".`,
          ),
        );
      }

      const target = publications
        ? { publication, repository: null }
        : { repository_version: versionHref, repository: null };

      const request = existing
        ? base.http.patch(rel(existing.pulp_href), target)
        : base.http.post(distributions, {
            name: base_path,
            base_path,
            pulp_labels: { [RELEASE_LABEL]: release },
            ...target,
          });

      return request.then(({ data }) => waitForTask(data.task));
    });
  },

  unpin(entry: ReleaseEntry) {
    return base.http
      .delete(rel(entry.distribution.pulp_href))
      .then(({ data }) => waitForTask(data.task));
  },
};
