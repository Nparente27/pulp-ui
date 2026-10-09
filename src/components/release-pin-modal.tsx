import { t } from '@lingui/core/macro';
import {
  Button,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  TextInput,
} from '@patternfly/react-core';
import { useEffect, useState } from 'react';
import {
  ReleaseAPI,
  type ReleasePlugin,
  isValidReleaseName,
  releaseBasePath,
  releasePlugins,
} from '../api/release';
import { FormFieldHelper } from './form-field-helper';
import { Spinner } from './patternfly-wrappers/l10n';

interface IProps {
  // fixed values are shown read-only; the rest are picked in the modal
  release?: string;
  plugin?: ReleasePlugin;
  repository?: { name: string; pulp_href: string };
  versionHref?: string;
  // plugins offered when no plugin is fixed
  plugins?: ReleasePlugin[];
  // release names offered as suggestions
  releases?: string[];
  title: string;
  onCancel: () => void;
  onPin: (pin: {
    release: string;
    plugin: ReleasePlugin;
    repositoryName: string;
    versionHref: string;
  }) => Promise<unknown>;
}

const versionLabel = ({ number, pulp_created }, latest) =>
  `${number}${number === latest ? ' ' + t`(latest)` : ''} - ${new Date(
    pulp_created,
  ).toLocaleString()}`;

export const ReleasePinModal = ({
  release: fixedRelease,
  plugin: fixedPlugin,
  repository: fixedRepository,
  versionHref: fixedVersion,
  plugins = [],
  releases = [],
  title,
  onCancel,
  onPin,
}: IProps) => {
  const [release, setRelease] = useState(fixedRelease ?? '');
  const [plugin, setPlugin] = useState<ReleasePlugin>(
    fixedPlugin ?? plugins[0],
  );
  const [repositories, setRepositories] = useState(null);
  const [repositoryHref, setRepositoryHref] = useState(
    fixedRepository?.pulp_href ?? '',
  );
  const [versions, setVersions] = useState(null);
  const [versionHref, setVersionHref] = useState(fixedVersion ?? '');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (fixedRepository || !plugin) {
      return;
    }
    setRepositories(null);
    setRepositoryHref('');
    ReleaseAPI.listRepositories(plugin)
      .then((list) => {
        setRepositories(list);
        setRepositoryHref(list[0]?.pulp_href ?? '');
      })
      .catch(() => setRepositories([]));
  }, [plugin]);

  useEffect(() => {
    if (fixedVersion || !repositoryHref) {
      return;
    }
    setVersions(null);
    ReleaseAPI.listVersions(repositoryHref)
      .then((list) => {
        setVersions(list);
        // newest first, so the default is the latest version
        setVersionHref((current) =>
          list.some(({ pulp_href }) => pulp_href === current)
            ? current
            : (list[0]?.pulp_href ?? ''),
        );
      })
      .catch(() => setVersions([]));
  }, [repositoryHref]);

  const repositoryName =
    fixedRepository?.name ??
    repositories?.find(({ pulp_href }) => pulp_href === repositoryHref)?.name;
  const releaseValid = isValidReleaseName(release);
  const ready =
    releaseValid && plugin && repositoryName && versionHref && !pending;
  const latest = versions?.[0]?.number;

  const submit = () => {
    setPending(true);
    onPin({ release, plugin, repositoryName, versionHref }).finally(() =>
      setPending(false),
    );
  };

  return (
    <Modal
      actions={[
        <Button
          key='pin'
          variant='primary'
          onClick={submit}
          isDisabled={!ready}
          data-cy='release-pin-button'
        >
          {t`Save`}
          {pending && <Spinner size='sm' />}
        </Button>,
        <Button key='cancel' variant='link' onClick={onCancel}>
          {t`Cancel`}
        </Button>,
      ]}
      isOpen
      onClose={onCancel}
      title={title}
      variant='medium'
    >
      <Form onSubmit={(e) => (e.preventDefault(), ready && submit())}>
        <FormGroup label={t`Release`} isRequired fieldId='release'>
          <TextInput
            id='release'
            value={release}
            onChange={(_e, value) => setRelease(value.trim())}
            isDisabled={!!fixedRelease}
            list='release-names'
            placeholder='HIVE-RELEASE'
            validated={!release || releaseValid ? 'default' : 'error'}
          />
          <datalist id='release-names'>
            {releases.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {release && !releaseValid ? (
            <FormFieldHelper variant='error'>
              {t`Use letters, numbers, dots, dashes and underscores, starting with a letter or number.`}
            </FormFieldHelper>
          ) : null}
        </FormGroup>

        <FormGroup label={t`Repository type`} fieldId='plugin'>
          <FormSelect
            id='plugin'
            value={plugin}
            onChange={(_e, value) => setPlugin(value as ReleasePlugin)}
            isDisabled={!!fixedPlugin}
          >
            {(fixedPlugin ? [fixedPlugin] : plugins).map((p) => (
              <FormSelectOption
                key={p}
                value={p}
                label={releasePlugins[p].title}
              />
            ))}
          </FormSelect>
        </FormGroup>

        <FormGroup label={t`Repository`} isRequired fieldId='repository'>
          {fixedRepository ? (
            <TextInput
              id='repository'
              value={fixedRepository.name}
              isDisabled
            />
          ) : repositories ? (
            <FormSelect
              id='repository'
              value={repositoryHref}
              onChange={(_e, value) => setRepositoryHref(value)}
              isDisabled={!repositories.length}
            >
              {repositories.length ? (
                repositories.map(({ name, pulp_href }) => (
                  <FormSelectOption
                    key={pulp_href}
                    value={pulp_href}
                    label={name}
                  />
                ))
              ) : (
                <FormSelectOption value='' label={t`No repositories`} />
              )}
            </FormSelect>
          ) : (
            <Spinner size='md' />
          )}
        </FormGroup>

        <FormGroup label={t`Version`} isRequired fieldId='version'>
          {fixedVersion ? (
            <TextInput
              id='version'
              value={fixedVersion.match(/versions\/(\d+)\/$/)?.[1] ?? ''}
              isDisabled
            />
          ) : versions || !repositoryHref ? (
            <FormSelect
              id='version'
              value={versionHref}
              onChange={(_e, value) => setVersionHref(value)}
              isDisabled={!versions?.length}
            >
              {(versions ?? []).map((version) => (
                <FormSelectOption
                  key={version.pulp_href}
                  value={version.pulp_href}
                  label={versionLabel(version, latest)}
                />
              ))}
            </FormSelect>
          ) : (
            <Spinner size='md' />
          )}
        </FormGroup>

        {releaseValid && plugin && repositoryName ? (
          <FormFieldHelper>
            {t`Served at base path ${releaseBasePath(release, plugin, repositoryName)}. If the release already contains this repository, it is moved to this version.`}
          </FormFieldHelper>
        ) : null}
      </Form>
    </Modal>
  );
};
