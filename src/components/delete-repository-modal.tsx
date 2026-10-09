import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { Alert, Checkbox, Text } from '@patternfly/react-core';
import { groupBy } from 'lodash';
import { useEffect, useState } from 'react';
import {
  ReleaseAPI,
  type ReleaseEntry,
  type ReleasePlugin,
} from 'src/api/release';
import { DeleteModal } from 'src/components';
import { parsePulpIDFromURL } from 'src/utilities';

interface IProps {
  closeAction: () => void;
  deleteAction: () => void;
  name: string;
  // when given, releases pinning a version of this repository are listed
  plugin?: ReleasePlugin;
  pulpId?: string;
}

// releases that pin a version of the repository; null while checking,
// undefined if the check failed
function useReleasesOf(plugin?: ReleasePlugin, pulpId?: string) {
  const [entries, setEntries] = useState<ReleaseEntry[]>(
    plugin && pulpId ? null : [],
  );

  useEffect(() => {
    if (!plugin || !pulpId) {
      return;
    }
    ReleaseAPI.listEntries([plugin])
      .then((all) =>
        setEntries(
          all.filter(
            ({ repositoryHref }) =>
              repositoryHref && parsePulpIDFromURL(repositoryHref) === pulpId,
          ),
        ),
      )
      .catch(() => setEntries(undefined));
  }, [plugin, pulpId]);

  return entries;
}

export const DeleteRepositoryModal = ({
  closeAction,
  deleteAction,
  name,
  plugin,
  pulpId,
}: IProps) => {
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const releaseEntries = useReleasesOf(plugin, pulpId);

  if (!name) {
    return null;
  }

  const checking = releaseEntries === null;
  const inReleases = !!releaseEntries?.length;
  const byRelease = Object.entries(
    groupBy(releaseEntries ?? [], 'release') as Record<string, ReleaseEntry[]>,
  );

  return (
    <DeleteModal
      spinner={pending || checking}
      cancelAction={() => {
        setPending(false);
        closeAction();
      }}
      deleteAction={() => {
        setPending(true);
        deleteAction();
      }}
      isDisabled={pending || checking || (inReleases && !confirmed)}
      title={t`Delete repository?`}
      variant={inReleases ? 'medium' : 'small'}
    >
      <Text>
        <Trans>
          Are you sure you want to delete the repository <b>{name}</b>?<br />
          <b>Note:</b> This will also delete all associated resources under this
          repository.
        </Trans>
      </Text>

      {inReleases ? (
        <>
          <br />
          <Alert
            isInline
            variant='danger'
            title={t`This repository is part of ${byRelease.length} release(s)`}
          >
            <p>
              {t`Deleting it also deletes every version these releases pin. Their URLs for this repository stop working, and the content cannot be brought back by recreating the repository.`}
            </p>
            <ul style={{ listStyle: 'disc', paddingLeft: '20px' }}>
              {byRelease.map(([release, entries]) => (
                <li key={release}>
                  <b>{release}</b>
                  {': '}
                  {entries
                    .map(
                      ({ versionNumber, distribution }) =>
                        t`version ${versionNumber} at ${distribution.base_path}`,
                    )
                    .join(', ')}
                </li>
              ))}
            </ul>
          </Alert>
          <br />
          <Checkbox
            id='confirm-delete-release-repository'
            label={t`I understand these releases will lose this repository.`}
            isChecked={confirmed}
            onChange={(_e, checked) => setConfirmed(checked)}
          />
        </>
      ) : releaseEntries === undefined ? (
        <>
          <br />
          <Alert
            isInline
            variant='warning'
            title={t`Could not check whether this repository is part of a release.`}
          />
        </>
      ) : null}
    </DeleteModal>
  );
};
