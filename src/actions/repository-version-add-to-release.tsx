import { msg, t } from '@lingui/core/macro';
import { uniq } from 'lodash';
import { ReleaseAPI, type ReleasePlugin } from '../api/release';
import { ReleasePinModal } from '../components/release-pin-modal';
import { handleHttpError } from '../utilities/fail-alerts';
import { Action } from './action';

const repositoryVersionAddToReleaseAction = (plugin: ReleasePlugin) =>
  Action({
    title: msg`Add to release`,
    modal: ({ addAlert, state, setState }) =>
      state.releaseModal ? (
        <ReleasePinModal
          title={t`Add version ${state.releaseModal.number} of "${state.releaseModal.repositoryName}" to a release`}
          plugin={plugin}
          repository={{
            name: state.releaseModal.repositoryName,
            pulp_href: state.releaseModal.repository,
          }}
          versionHref={state.releaseModal.pulp_href}
          releases={state.releaseModal.releases}
          onCancel={() => setState({ releaseModal: null })}
          onPin={({ release, repositoryName, versionHref }) =>
            ReleaseAPI.pin(release, plugin, repositoryName, versionHref)
              .then(() =>
                addAlert({
                  variant: 'success',
                  title: t`Release "${release}" now serves version ${state.releaseModal.number} of "${repositoryName}".`,
                }),
              )
              .catch(
                handleHttpError(
                  t`Failed to add "${repositoryName}" to release "${release}".`,
                  () => null,
                  addAlert,
                ),
              )
              .finally(() => setState({ releaseModal: null }))
          }
        />
      ) : null,
    onClick: (
      { repositoryName, number, pulp_href, repository },
      { setState },
    ) => {
      const open = (releases: string[]) =>
        setState({
          releaseModal: {
            repositoryName,
            number,
            pulp_href,
            repository,
            releases,
          },
        });

      // existing release names as suggestions; the modal works without them
      ReleaseAPI.listEntries([plugin])
        .then((entries) => open(uniq(entries.map((e) => e.release))))
        .catch(() => open([]));
    },
  });

export const ansibleRepositoryVersionAddToReleaseAction =
  repositoryVersionAddToReleaseAction('ansible');
export const debRepositoryVersionAddToReleaseAction =
  repositoryVersionAddToReleaseAction('deb');
export const fileRepositoryVersionAddToReleaseAction =
  repositoryVersionAddToReleaseAction('file');
export const pythonRepositoryVersionAddToReleaseAction =
  repositoryVersionAddToReleaseAction('python');
export const rpmRepositoryVersionAddToReleaseAction =
  repositoryVersionAddToReleaseAction('rpm');
