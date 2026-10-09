import { t } from '@lingui/core/macro';
import {
  Button,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { DropdownItem } from '@patternfly/react-core/deprecated';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { groupBy, uniq } from 'lodash';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ReleaseAPI, type ReleaseEntry, releasePlugins } from 'src/api/release';
import {
  AlertList,
  type AlertType,
  BaseHeader,
  DateComponent,
  DeleteModal,
  EmptyStateNoData,
  ListItemActions,
  LoadingSpinner,
  Main,
  closeAlert,
} from 'src/components';
import { ReleasePinModal } from 'src/components/release-pin-modal';
import { Paths, formatPath } from 'src/paths';
import { handleHttpError } from 'src/utilities';
import { useReleasePlugins } from './use-release-plugins';

const ReleaseList = () => {
  const navigate = useNavigate();
  const plugins = useReleasePlugins();
  const [entries, setEntries] = useState<ReleaseEntry[]>(null);
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string>(null);
  const [pending, setPending] = useState(false);

  const addAlert = (alert: AlertType) =>
    setAlerts((alerts) => [...alerts, alert]);

  const load = () =>
    ReleaseAPI.listEntries(plugins)
      .then(setEntries)
      .catch(
        handleHttpError(
          t`Releases could not be displayed.`,
          () => setEntries([]),
          addAlert,
        ),
      );

  useEffect(() => {
    if (plugins) {
      load();
    }
  }, [plugins]);

  const releases = Object.entries(
    groupBy(entries ?? [], 'release') as Record<string, ReleaseEntry[]>,
  ).map(([name, items]) => ({
    name,
    items,
    types: uniq(items.map(({ plugin }) => plugin))
      .map((plugin) => releasePlugins[plugin].title)
      .join(', '),
    updated: items
      .map(
        ({ distribution }) =>
          distribution.pulp_last_updated ?? distribution.pulp_created,
      )
      .sort()
      .at(-1),
  }));

  const deleteRelease = (name: string) => {
    setPending(true);
    Promise.all(
      releases
        .find((release) => release.name === name)
        .items.map((entry) => ReleaseAPI.unpin(entry)),
    )
      .then(() =>
        addAlert({ variant: 'success', title: t`Release "${name}" deleted.` }),
      )
      .catch(
        handleHttpError(
          t`Failed to delete release "${name}".`,
          () => null,
          addAlert,
        ),
      )
      .finally(() => {
        setPending(false);
        setDeleting(null);
        load();
      });
  };

  const createButton = (
    <Button onClick={() => setCreating(true)} isDisabled={!plugins?.length}>
      {t`Create release`}
    </Button>
  );

  return (
    <>
      <AlertList
        alerts={alerts}
        closeAlert={(i) => closeAlert(i, { alerts, setAlerts })}
      />
      <BaseHeader title={t`Releases`} />
      {creating ? (
        <ReleasePinModal
          title={t`Create release`}
          plugins={plugins}
          releases={releases.map(({ name }) => name)}
          onCancel={() => setCreating(false)}
          onPin={({ release, plugin, repositoryName, versionHref }) =>
            ReleaseAPI.pin(release, plugin, repositoryName, versionHref)
              .then(() =>
                navigate(
                  formatPath(Paths.core.release.detail, { name: release }),
                ),
              )
              .catch(
                handleHttpError(
                  t`Failed to create release "${release}".`,
                  () => setCreating(false),
                  addAlert,
                ),
              )
          }
        />
      ) : null}
      {deleting ? (
        <DeleteModal
          title={t`Delete release?`}
          cancelAction={() => setDeleting(null)}
          deleteAction={() => deleteRelease(deleting)}
          isDisabled={pending}
          spinner={pending}
        >
          {t`This removes the distributions serving release "${deleting}", so its URLs stop working. The repositories and their versions are not changed.`}
        </DeleteModal>
      ) : null}
      <Main>
        {!entries ? (
          <LoadingSpinner />
        ) : !releases.length ? (
          <EmptyStateNoData
            title={t`No releases yet`}
            description={t`A release pins a set of repositories to specific versions, so everything built from it is reproducible.`}
            button={createButton}
          />
        ) : (
          <section className='pulp-section'>
            <Toolbar>
              <ToolbarContent>
                <ToolbarGroup>
                  <ToolbarItem>{createButton}</ToolbarItem>
                </ToolbarGroup>
              </ToolbarContent>
            </Toolbar>
            <Table aria-label={t`Releases`}>
              <Thead>
                <Tr>
                  <Th>{t`Release`}</Th>
                  <Th>{t`Repositories`}</Th>
                  <Th>{t`Types`}</Th>
                  <Th>{t`Last changed`}</Th>
                  <Th />
                </Tr>
              </Thead>
              <Tbody>
                {releases.map(({ name, items, types, updated }) => (
                  <Tr key={name}>
                    <Td>
                      <Link
                        to={formatPath(Paths.core.release.detail, { name })}
                      >
                        {name}
                      </Link>
                    </Td>
                    <Td>{items.length}</Td>
                    <Td>{types}</Td>
                    <Td>
                      <DateComponent date={updated} />
                    </Td>
                    <ListItemActions
                      kebabItems={[
                        <DropdownItem
                          key='delete'
                          onClick={() => setDeleting(name)}
                        >
                          {t`Delete`}
                        </DropdownItem>,
                      ]}
                    />
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </section>
        )}
      </Main>
    </>
  );
};

export default ReleaseList;
