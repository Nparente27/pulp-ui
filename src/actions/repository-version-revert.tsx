import { msg, t } from '@lingui/core/macro';
import { Button, Modal } from '@patternfly/react-core';
import { useState } from 'react';
import { AnsibleRepositoryAPI } from '../api/ansible-repository';
import { DebRepositoryAPI } from '../api/deb-repository';
import { FileRepositoryAPI } from '../api/file-repository';
import { PythonRepositoryAPI } from '../api/python-repository';
import { RPMRepositoryAPI } from '../api/rpm-repository';
import { Spinner } from '../components/patternfly-wrappers/l10n';
import { handleHttpError } from '../utilities/fail-alerts';
import { parsePulpIDFromURL } from '../utilities/parse-pulp-id';
import { taskAlert } from '../utilities/task-alert';
import { waitForTaskUrl } from '../utilities/wait-for-task';
import { Action } from './action';

interface RevertAPI {
  revert: (id: string, version_href: string) => Promise<{ data }>;
}

const RevertModal = ({
  repositoryName,
  version,
  cancelAction,
  revertAction,
}: {
  repositoryName: string;
  version: number;
  cancelAction: () => void;
  revertAction: () => void;
}) => {
  const [pending, setPending] = useState(false);

  return (
    <Modal
      actions={[
        <div data-cy='revert-button' key='revert'>
          <Button
            key='revert'
            onClick={() => {
              setPending(true);
              revertAction();
            }}
            variant='danger'
            isDisabled={pending}
          >
            {t`Set as latest`}
            {pending && <Spinner size='sm' />}
          </Button>
        </div>,
        <Button key='cancel' onClick={cancelAction} variant='link'>
          {t`Cancel`}
        </Button>,
      ]}
      isOpen
      onClose={cancelAction}
      title={t`Set latest version`}
      titleIconVariant='warning'
      variant={'small'}
      data-cy='modal_revert'
    >
      <p>
        {t`Are you sure you want the latest version of "${repositoryName}" to match version ${version}?`}
      </p>
      <br />
      <p>
        {t`A new repository version is created with the content of version ${version}. Distributions serving the latest version will serve it once the task completes; older versions are kept, so you can move back at any time.`}
      </p>
    </Modal>
  );
};

function revert(
  api: RevertAPI,
  { repositoryName, pulp_href, number },
  { addAlert, setState, refresh },
) {
  // the uuid in version href is the repository uuid
  const pulpId = parsePulpIDFromURL(pulp_href);

  return api
    .revert(pulpId, pulp_href)
    .then(({ data }) => {
      addAlert(
        taskAlert(
          data.task,
          t`Setting latest version of "${repositoryName}" to version ${number}.`,
        ),
      );
      setState({ revertModal: null });

      return waitForTaskUrl(data.task)
        .then(() => {
          addAlert({
            variant: 'success',
            title: t`Latest version of "${repositoryName}" now matches version ${number}.`,
          });
          // reload the repository so the "(latest)" marker moves
          refresh?.();
        })
        .catch((e) =>
          addAlert({
            variant: 'danger',
            title: t`Failed to set latest version of "${repositoryName}" to version ${number}.`,
            description: e?.message ?? e,
          }),
        );
    })
    .catch(
      handleHttpError(
        t`Failed to set latest version of "${repositoryName}" to version ${number}.`,
        () => setState({ revertModal: null }),
        addAlert,
      ),
    );
}

const repositoryVersionRevertAction = (api: RevertAPI, permission: string) =>
  Action({
    title: msg`Set as latest version`,
    modal: ({ addAlert, state, setState, refresh }) =>
      state.revertModal ? (
        <RevertModal
          cancelAction={() => setState({ revertModal: null })}
          revertAction={() =>
            revert(api, state.revertModal, { addAlert, setState, refresh })
          }
          repositoryName={state.revertModal.repositoryName}
          version={state.revertModal.number}
        />
      ) : null,
    onClick: ({ repositoryName, number, pulp_href }, { setState }) =>
      setState({ revertModal: { repositoryName, number, pulp_href } }),
    visible: (_item, { hasPermission }) => hasPermission(permission),
    disabled: ({ isLatest }) =>
      isLatest ? t`Already the latest version` : null,
  });

export const ansibleRepositoryVersionRevertAction =
  repositoryVersionRevertAction(
    AnsibleRepositoryAPI,
    'ansible.change_ansiblerepository',
  );
export const debRepositoryVersionRevertAction = repositoryVersionRevertAction(
  DebRepositoryAPI,
  'deb.change_aptrepository',
);
export const fileRepositoryVersionRevertAction = repositoryVersionRevertAction(
  FileRepositoryAPI,
  'file.change_filerepository',
);
export const pythonRepositoryVersionRevertAction =
  repositoryVersionRevertAction(
    PythonRepositoryAPI,
    'python.change_pythonrepository',
  );
export const rpmRepositoryVersionRevertAction = repositoryVersionRevertAction(
  RPMRepositoryAPI,
  'rpm.change_rpmrepository',
);
