import { t } from '@lingui/core/macro';
import {
  Button,
  Form,
  FormGroup,
  Modal,
  TextInput,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { DropdownItem } from '@patternfly/react-core/deprecated';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ReleaseAPI,
  type ReleaseEntry,
  isValidReleaseName,
  releasePlugins,
} from 'src/api/release';
import {
  AlertList,
  type AlertType,
  BaseHeader,
  Breadcrumbs,
  CopyURL,
  DeleteModal,
  EmptyStateNoData,
  ListItemActions,
  LoadingSpinner,
  Main,
  Spinner,
  closeAlert,
} from 'src/components';
import { ReleasePinModal } from 'src/components/release-pin-modal';
import { Paths, formatPath } from 'src/paths';
import { handleHttpError } from 'src/utilities';
import { useReleasePlugins } from './use-release-plugins';

type ModalState =
  | null
  | { type: 'add' }
  | { type: 'change'; entry: ReleaseEntry }
  | { type: 'remove'; entry: ReleaseEntry }
  | { type: 'copy' }
  | { type: 'delete' };

const CopyModal = ({
  release,
  onCancel,
  onCopy,
}: {
  release: string;
  onCancel: () => void;
  onCopy: (name: string) => Promise<unknown>;
}) => {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const valid = isValidReleaseName(name) && name !== release;

  const submit = () => {
    setPending(true);
    onCopy(name).finally(() => setPending(false));
  };

  return (
    <Modal
      actions={[
        <Button
          key='copy'
          variant='primary'
          onClick={submit}
          isDisabled={!valid || pending}
        >
          {t`Copy`}
          {pending && <Spinner size='sm' />}
        </Button>,
        <Button key='cancel' variant='link' onClick={onCancel}>
          {t`Cancel`}
        </Button>,
      ]}
      isOpen
      onClose={onCancel}
      title={t`Copy release "${release}"`}
      variant='small'
    >
      <Form onSubmit={(e) => (e.preventDefault(), valid && submit())}>
        <FormGroup label={t`New release name`} isRequired fieldId='name'>
          <TextInput
            id='name'
            value={name}
            onChange={(_e, value) => setName(value.trim())}
            validated={!name || valid ? 'default' : 'error'}
          />
        </FormGroup>
        {t`The new release starts with the same repository versions. Changing either release afterwards does not affect the other.`}
      </Form>
    </Modal>
  );
};

const ReleaseDetail = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  const plugins = useReleasePlugins();
  const [entries, setEntries] = useState<ReleaseEntry[]>(null);
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [pending, setPending] = useState(false);

  const addAlert = (alert: AlertType) =>
    setAlerts((alerts) => [...alerts, alert]);

  // only the newest request may set entries, so switching releases (or a
  // reload racing an earlier one) never shows another release's rows
  const latestLoad = useRef(0);
  const load = () => {
    const current = ++latestLoad.current;
    const set = (value: ReleaseEntry[]) =>
      current === latestLoad.current && setEntries(value);

    return ReleaseAPI.listEntries(plugins, name)
      .then(set)
      .catch(
        handleHttpError(
          t`Release "${name}" could not be displayed.`,
          () => set([]),
          addAlert,
        ),
      );
  };

  useEffect(() => {
    setEntries(null);
    if (plugins) {
      load();
    }
  }, [plugins, name]);

  const close = () => {
    setModal(null);
    setPending(false);
    load();
  };

  const pin = ({ release, plugin, repositoryName, versionHref }) =>
    ReleaseAPI.pin(release, plugin, repositoryName, versionHref)
      .then(() =>
        addAlert({
          variant: 'success',
          title: t`Release "${release}" updated.`,
        }),
      )
      .catch(
        handleHttpError(
          t`Failed to update release "${release}".`,
          () => null,
          addAlert,
        ),
      )
      .finally(close);

  const remove = (entries: ReleaseEntry[], done: string, failed: string) => {
    setPending(true);
    return Promise.all(entries.map((entry) => ReleaseAPI.unpin(entry)))
      .then(() => {
        addAlert({ variant: 'success', title: done });
        return true;
      })
      .catch((e) => {
        handleHttpError(failed, () => null, addAlert)(e);
        return false;
      });
  };

  // one at a time: publications for the same repository must not race
  const copy = (target: string) =>
    entries
      .reduce(
        (prev, { plugin, repositoryName, versionHref }) =>
          prev.then(() =>
            ReleaseAPI.pin(target, plugin, repositoryName, versionHref),
          ),
        Promise.resolve(null),
      )
      .then(() => {
        setModal(null);
        navigate(formatPath(Paths.core.release.detail, { name: target }));
      })
      .catch(
        handleHttpError(
          t`Failed to copy release "${name}" to "${target}".`,
          close,
          addAlert,
        ),
      );

  const releaseNames = [name];

  return (
    <>
      <AlertList
        alerts={alerts}
        closeAlert={(i) => closeAlert(i, { alerts, setAlerts })}
      />
      <BaseHeader
        title={name}
        breadcrumbs={
          <Breadcrumbs
            links={[
              { url: formatPath(Paths.core.release.list), name: t`Releases` },
              { name },
            ]}
          />
        }
        pageControls={
          <div className='pulp-toolbar'>
            <Toolbar>
              <ToolbarContent>
                <ToolbarGroup>
                  <ToolbarItem>
                    <Button
                      onClick={() => setModal({ type: 'add' })}
                      isDisabled={!plugins?.length}
                    >
                      {t`Add repository`}
                    </Button>
                  </ToolbarItem>
                  <ToolbarItem>
                    <Button
                      variant='secondary'
                      onClick={() => setModal({ type: 'copy' })}
                      isDisabled={!entries?.length}
                    >
                      {t`Copy to new release`}
                    </Button>
                  </ToolbarItem>
                  <ToolbarItem>
                    <Button
                      variant='secondary'
                      isDanger
                      onClick={() => setModal({ type: 'delete' })}
                      isDisabled={!entries?.length}
                    >
                      {t`Delete release`}
                    </Button>
                  </ToolbarItem>
                </ToolbarGroup>
              </ToolbarContent>
            </Toolbar>
          </div>
        }
      />

      {modal?.type === 'add' ? (
        <ReleasePinModal
          title={t`Add repository to "${name}"`}
          release={name}
          plugins={plugins}
          releases={releaseNames}
          onCancel={() => setModal(null)}
          onPin={pin}
        />
      ) : null}
      {modal?.type === 'change' ? (
        <ReleasePinModal
          title={t`Change version of "${modal.entry.repositoryName}" in "${name}"`}
          release={name}
          plugin={modal.entry.plugin}
          repository={{
            name: modal.entry.repositoryName,
            pulp_href: modal.entry.repositoryHref,
          }}
          releases={releaseNames}
          onCancel={() => setModal(null)}
          onPin={pin}
        />
      ) : null}
      {modal?.type === 'copy' ? (
        <CopyModal
          release={name}
          onCancel={() => setModal(null)}
          onCopy={copy}
        />
      ) : null}
      {modal?.type === 'remove' ? (
        <DeleteModal
          title={t`Remove from release?`}
          isRemove
          cancelAction={() => setModal(null)}
          deleteAction={() =>
            remove(
              [modal.entry],
              t`Removed "${modal.entry.distribution.base_path}" from "${name}".`,
              t`Failed to remove "${modal.entry.distribution.base_path}" from "${name}".`,
            ).finally(close)
          }
          isDisabled={pending}
          spinner={pending}
        >
          {t`${modal.entry.distribution.base_path} stops being served. The repository and its versions are not changed.`}
        </DeleteModal>
      ) : null}
      {modal?.type === 'delete' ? (
        <DeleteModal
          title={t`Delete release?`}
          cancelAction={() => setModal(null)}
          deleteAction={() =>
            remove(
              entries,
              t`Release "${name}" deleted.`,
              t`Failed to delete release "${name}".`,
            ).then((ok) =>
              ok ? navigate(formatPath(Paths.core.release.list)) : close(),
            )
          }
          isDisabled={pending}
          spinner={pending}
        >
          {t`This removes the distributions serving release "${name}", so its URLs stop working. The repositories and their versions are not changed.`}
        </DeleteModal>
      ) : null}

      <Main>
        {!entries ? (
          <LoadingSpinner />
        ) : !entries.length ? (
          <EmptyStateNoData
            title={t`No repositories in this release`}
            description={t`Add a repository and pick the version this release should serve.`}
            button={
              <Button
                onClick={() => setModal({ type: 'add' })}
                isDisabled={!plugins?.length}
              >
                {t`Add repository`}
              </Button>
            }
          />
        ) : (
          <section className='pulp-section'>
            <Table aria-label={t`Repositories in release`}>
              <Thead>
                <Tr>
                  <Th>{t`Type`}</Th>
                  <Th>{t`Repository`}</Th>
                  <Th>{t`Version`}</Th>
                  <Th>{t`Base path`}</Th>
                  <Th>{t`URL`}</Th>
                  <Th />
                </Tr>
              </Thead>
              <Tbody>
                {entries.map((entry) => {
                  const {
                    plugin,
                    distribution,
                    repositoryName,
                    versionNumber,
                  } = entry;
                  const detail = Paths[plugin].repository.detail;

                  return (
                    <Tr key={distribution.pulp_href}>
                      <Td>{releasePlugins[plugin].title}</Td>
                      <Td>
                        {repositoryName ? (
                          <Link
                            to={formatPath(detail, { name: repositoryName })}
                          >
                            {repositoryName}
                          </Link>
                        ) : (
                          t`Missing`
                        )}
                      </Td>
                      <Td>
                        {repositoryName && versionNumber !== null ? (
                          <Link
                            to={formatPath(
                              detail,
                              { name: repositoryName },
                              {
                                repositoryVersion: versionNumber,
                                tab: 'repository-versions',
                              },
                            )}
                          >
                            {versionNumber}
                          </Link>
                        ) : (
                          t`None`
                        )}
                      </Td>
                      <Td>{distribution.base_path}</Td>
                      <Td>
                        <CopyURL
                          url={distribution.base_url ?? distribution.client_url}
                          fallback
                        />
                      </Td>
                      <ListItemActions
                        kebabItems={[
                          repositoryName ? (
                            <DropdownItem
                              key='change'
                              onClick={() =>
                                setModal({ type: 'change', entry })
                              }
                            >
                              {t`Change version`}
                            </DropdownItem>
                          ) : null,
                          <DropdownItem
                            key='remove'
                            onClick={() => setModal({ type: 'remove', entry })}
                          >
                            {t`Remove from release`}
                          </DropdownItem>,
                        ]}
                      />
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </section>
        )}
      </Main>
    </>
  );
};

export default ReleaseDetail;
