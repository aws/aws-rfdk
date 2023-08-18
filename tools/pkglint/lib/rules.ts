import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import { LICENSE, NOTICE } from './licensing';
import { PackageJson, ValidationRule } from './packagejson';
import {
  deepGet, deepSet,
  expectDevDependency, expectJSON,
  fileShouldBe, fileShouldContain,
  fileShouldNotContain,
  findInnerPackages,
  monoRepoRoot,
} from './util';

const PKGLINT_VERSION = require('../package.json').version; // eslint-disable-line @typescript-eslint/no-require-imports

/**
 * Verify that the package name matches the directory name
 */
export class PackageNameMatchesDirectoryName extends ValidationRule {
  public readonly name = 'naming/package-matches-directory';

  public validate(pkg: PackageJson): void {
    const parts = pkg.packageRoot.split(path.sep);

    const expectedName = parts[parts.length - 2].startsWith('@')
      ? parts.slice(parts.length - 2).join('/')
      : parts[parts.length - 1];

    expectJSON(this.name, pkg, 'name', expectedName);
  }
}

/**
 * Verify that all packages have a description
 */
export class DescriptionIsRequired extends ValidationRule {
  public readonly name = 'package-info/require-description';

  public validate(pkg: PackageJson): void {
    if (!pkg.json.description) {
      pkg.report({ ruleName: this.name, message: 'Description is required' });
    }
  }
}

/**
 * Verify cdk.out directory is included in npmignore since we should not be
 * publishing it.
 */
export class CdkOutMustBeNpmIgnored extends ValidationRule {

  public readonly name = 'package-info/npm-ignore-cdk-out';

  public validate(pkg: PackageJson): void {

    const npmIgnorePath = path.join(pkg.packageRoot, '.npmignore');

    if (fs.existsSync(npmIgnorePath)) {

      const npmIgnore = fs.readFileSync(npmIgnorePath);

      if (!npmIgnore.includes('**/cdk.out')) {
        pkg.report({
          ruleName: this.name,
          message: `${npmIgnorePath}: Must exclude **/cdk.out`,
          fix: () => fs.writeFileSync(
            npmIgnorePath,
            `${npmIgnore}\n# exclude cdk artifacts\n**/cdk.out`,
          ),
        });
      }
    }
  }

}

/**
 * Repository must be our GitHub repo
 */
export class RepositoryCorrect extends ValidationRule {
  public readonly name = 'package-info/repository';

  public validate(pkg: PackageJson): void {
    expectJSON(this.name, pkg, 'repository.type', 'git');
    expectJSON(this.name, pkg, 'repository.url', 'https://github.com/aws/aws-rfdk.git');
    const pkgDir = path.relative(monoRepoRoot(), pkg.packageRoot);
    expectJSON(this.name, pkg, 'repository.directory', pkgDir);
  }
}

/**
 * Homepage must point to the GitHub repository page.
 */
export class HomepageCorrect extends ValidationRule {
  public readonly name = 'package-info/homepage';

  public validate(pkg: PackageJson): void {
    expectJSON(this.name, pkg, 'homepage', 'https://github.com/aws/aws-rfdk');
  }
}

/**
 * The license must be Apache-2.0.
 */
export class License extends ValidationRule {
  public readonly name = 'package-info/license';

  public validate(pkg: PackageJson): void {
    expectJSON(this.name, pkg, 'license', 'Apache-2.0');
  }
}

/**
 * There must be a license file that corresponds to the Apache-2.0 license.
 */
export class LicenseFile extends ValidationRule {
  public readonly name = 'license/license-file';

  public validate(pkg: PackageJson): void {
    fileShouldBe(this.name, pkg, 'LICENSE', LICENSE);
  }
}

/**
 * There must be a NOTICE file.
 */
export class NoticeFile extends ValidationRule {
  public readonly name = 'license/notice-file';

  public validate(pkg: PackageJson): void {
    fileShouldBe(this.name, pkg, 'NOTICE', NOTICE);
  }
}

/**
 * Author must be AWS (as an Organization)
 */
export class AuthorAWS extends ValidationRule {
  public readonly name = 'package-info/author';

  public validate(pkg: PackageJson): void {
    expectJSON(this.name, pkg, 'author.name', 'Amazon Web Services');
    expectJSON(this.name, pkg, 'author.url', 'https://aws.amazon.com');
    expectJSON(this.name, pkg, 'author.organization', true);
  }
}

/**
 * There must be a README.md file.
 */
export class ReadmeFile extends ValidationRule {
  public readonly name = 'package-info/README.md';

  public validate(pkg: PackageJson): void {
    const readmeFile = path.join(pkg.packageRoot, 'README.md');

    const headline = 'Render Farm Deployment Kit on AWS';

    if (!fs.existsSync(readmeFile)) {
      pkg.report({
        ruleName: this.name,
        message: 'There must be a README.md file at the root of the package',
      });
    } else if (headline) {
      const requiredFirstLine = `# ${headline}`;
      const [firstLine, ...rest] = fs.readFileSync(readmeFile, { encoding: 'utf8' }).split('\n');
      if (firstLine !== requiredFirstLine) {
        pkg.report({
          ruleName: this.name,
          message: `The title of the README.md file must be "${headline}"`,
          fix: () => fs.writeFileSync(readmeFile, [requiredFirstLine, ...rest].join('\n')),
        });
      }
    }
  }
}

/**
 * Keywords must contain RFDK keywords.
 */
export class Keywords extends ValidationRule {
  public readonly name = 'package-info/keywords';

  public validate(pkg: PackageJson): void {
    if (!pkg.json.keywords) {
      pkg.report({
        ruleName: this.name,
        message: 'Must have keywords',
        fix: () => { pkg.json.keywords = []; },
      });
    }

    const keywords = pkg.json.keywords || [];
    const requiredKeywords = [
      'CDK',
      'AWS',
      'RFDK',
    ];
    for (const keyword of requiredKeywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (keywords.indexOf(lowerKeyword) === -1) {
        pkg.report({
          ruleName: this.name,
          message: `Keywords must mention ${keyword}`,
          fix: () => { pkg.json.keywords.splice(0, 0, lowerKeyword); },
        });
      }
    }
  }
}

export class JSIIPythonTarget extends ValidationRule {
  public readonly name = 'jsii/python';

  public validate(pkg: PackageJson): void {
    if (!isJSII(pkg)) { return; }

    const moduleName = rfdkModuleName(pkg.json.name);

    expectJSON(this.name, pkg, 'jsii.targets.python.distName', moduleName.python.distName);
    expectJSON(this.name, pkg, 'jsii.targets.python.module', moduleName.python.module);
  }
}

export class RFDKPackage extends ValidationRule {
  public readonly name = 'package-info/scripts/package';

  public validate(pkg: PackageJson): void {
    // skip private packages
    if (pkg.json.private) { return; }

    const merkleMarker = '.LAST_PACKAGE';

    const outdir = 'dist';

    // if this is
    if (isJSII(pkg)) {
      expectJSON(this.name, pkg, 'jsii.outdir', outdir);
    }

    fileShouldContain(this.name, pkg, '.npmignore', outdir);
    fileShouldContain(this.name, pkg, '.gitignore', outdir);
    fileShouldContain(this.name, pkg, '.npmignore', merkleMarker);
    fileShouldContain(this.name, pkg, '.gitignore', merkleMarker);
  }
}

export class NoTsBuildInfo extends ValidationRule {
  public readonly name = 'npmignore/tsbuildinfo';

  public validate(pkg: PackageJson): void {
    // skip private packages
    if (pkg.json.private) { return; }

    // Stop 'tsconfig.tsbuildinfo' and regular '.tsbuildinfo' files from being
    // published to NPM.
    // We might at some point also want to strip tsconfig.json but for now,
    // the TypeScript DOCS BUILD needs to it to load the typescript source.
    fileShouldContain(this.name, pkg, '.npmignore', '*.tsbuildinfo');
  }
}

export class NoTsConfig extends ValidationRule {
  public readonly name = 'npmignore/tsconfig';

  public validate(pkg: PackageJson): void {
    // skip private packages
    if (pkg.json.private) { return; }

    fileShouldContain(this.name, pkg, '.npmignore', 'tsconfig.json');
  }
}

export class IncludeJsiiInNpmTarball extends ValidationRule {
  public readonly name = 'npmignore/jsii-included';

  public validate(pkg: PackageJson): void {
    // only jsii modules
    if (!isJSII(pkg)) { return; }

    // skip private packages
    if (pkg.json.private) { return; }

    fileShouldNotContain(this.name, pkg, '.npmignore', '.jsii');
    fileShouldContain(this.name, pkg, '.npmignore', '!.jsii'); // make sure .jsii is included
  }
}

/**
 * Verifies that the expected versions of node will be supported.
 */
export class NodeCompatibility extends ValidationRule {
  public readonly name = 'dependencies/node-version';

  public validate(pkg: PackageJson): void {
    const atTypesNode = pkg.getDevDependency('@types/node');
    if (atTypesNode && !atTypesNode.startsWith('^18.')) {
      pkg.report({
        ruleName: this.name,
        message: `packages must support node version 18 and up, but ${atTypesNode} is declared`,
        fix: () => pkg.addDevDependency('@types/node', '^18.0.0'),
      });
    }
  }
}

/**
 * Verifies that the ``@types/`` dependencies are correctly recorded in ``devDependencies`` and not ``dependencies``.
 */
export class NoAtTypesInDependencies extends ValidationRule {
  public readonly name = 'dependencies/at-types';

  public validate(pkg: PackageJson): void {
    const predicate = (s: string) => s.startsWith('@types/');
    for (const dependency of pkg.getDependencies(predicate)) {
      pkg.report({
        ruleName: this.name,
        message: `dependency on ${dependency.name}@${dependency.version} must be in devDependencies`,
        fix: () => {
          pkg.addDevDependency(dependency.name, dependency.version);
          pkg.removeDependency(predicate);
        },
      });
    }
  }
}

/**
 * Computes the module name for various other purposes (java package, ...)
 */
function rfdkModuleName(name: string) {
  name = name.replace(/^aws-rfdk-/, '');
  name = name.replace(/^@aws-rfdk\//, '');

  return {
    python: {
      distName: 'aws-rfdk',
      module: 'aws_rfdk',
    },
  };
}

/**
 * Dependencies in both regular and peerDependencies must agree in semver
 *
 * In particular, verify that depVersion satisfies peerVersion. This prevents
 * us from instructing NPM to construct impossible closures, where we say:
 *
 *    peerDependency: A@1.0.0
 *    dependency: A@2.0.0
 *
 * There is no version of A that would satisfy this.
 *
 * The other way around is not necessary--the depVersion can be bumped without
 * bumping the peerVersion (if the API didn't change this may be perfectly
 * valid). This prevents us from restricting a user's potential combinations of
 * libraries unnecessarily.
 */
export class RegularDependenciesMustSatisfyPeerDependencies extends ValidationRule {
  public readonly name = 'dependencies/peer-dependencies-satisfied';

  public validate(pkg: PackageJson): void {
    for (const [depName, peerVersion] of Object.entries(pkg.peerDependencies)) {
      const depVersion = pkg.dependencies[depName];
      if (depVersion === undefined) { continue; }

      // Make sure that depVersion satisfies peerVersion.
      if (!semver.intersects(depVersion, peerVersion)) {
        pkg.report({
          ruleName: this.name,
          message: `dependency ${depName}: concrete version ${depVersion} does not match peer version '${peerVersion}'`,
          fix: () => pkg.addPeerDependency(depName, depVersion),
        });
      }
    }
  }
}

export class MustIgnoreJunitXml extends ValidationRule {
  public readonly name = 'ignore/junit';

  public validate(pkg: PackageJson): void {
    fileShouldContain(this.name, pkg, '.npmignore', 'junit.xml');
    fileShouldContain(this.name, pkg, '.gitignore', 'junit.xml');
  }
}

export class NpmIgnoreForJsiiModules extends ValidationRule {
  public readonly name = 'ignore/jsii';

  public validate(pkg: PackageJson): void {
    if (!isJSII(pkg)) { return; }

    fileShouldContain(this.name, pkg, '.npmignore',
      '*.ts',
      '!*.d.ts',
      '!*.js',
      'coverage',
      '.nyc_output',
      '*.tgz',
    );
  }
}


/**
 * Must have test-generated files in .gitignore
 */
export class MustIgnoreTestFiles extends ValidationRule {
  public readonly name = 'package-info/scripts/test';

  public validate(pkg: PackageJson): void {
    if (!hasTestDirectory(pkg)) { return; }

    // Tests ill calculate coverage, so have the appropriate
    // files in .gitignore.
    fileShouldContain(this.name, pkg, '.gitignore', '.nyc_output');
    fileShouldContain(this.name, pkg, '.gitignore', 'coverage');
    fileShouldContain(this.name, pkg, '.gitignore', 'nyc.config.js');
  }
}

/**
 * Must declare minimum node version
 */
export class MustHaveNodeEnginesDeclaration extends ValidationRule {
  public readonly name = 'package-info/engines';

  public validate(pkg: PackageJson): void {
    expectJSON(this.name, pkg, 'engines.node', '>= 18.0.0');
  }
}

export class PkgLintAsScript extends ValidationRule {
  public readonly name = 'package-info/scripts/pkglint';

  public validate(pkg: PackageJson): void {
    const script = 'pkglint';

    expectDevDependency(this.name, pkg, 'pkglint', `${PKGLINT_VERSION}`);

    if (!pkg.npmScript('pkglint')) {
      pkg.report({
        ruleName: this.name,
        message: 'a script called "pkglint" must be included to allow fixing package linting issues',
        fix: () => pkg.changeNpmScript('pkglint', () => script),
      });
    }

    if (pkg.npmScript('pkglint') !== script) {
      pkg.report({
        ruleName: this.name,
        message: 'the pkglint script should be: ' + script,
        fix: () => pkg.changeNpmScript('pkglint', () => script),
      });
    }
  }
}

export class NoStarDeps extends ValidationRule {
  public readonly name = 'dependencies/no-star';

  public validate(pkg: PackageJson) {
    reportStarDeps(this.name, pkg.json.depedencies);
    reportStarDeps(this.name, pkg.json.devDependencies);

    function reportStarDeps(ruleName: string, deps?: any) {
      deps = deps || {};
      Object.keys(deps).forEach(d => {
        if (deps[d] === '*') {
          pkg.report({
            ruleName,
            message: `star dependency not allowed for ${d}`,
          });
        }
      });
    }
  }
}

interface VersionCount {
  version: string;
  count: number;
}

/**
 * All consumed versions of dependencies must be the same
 *
 * NOTE: this rule will only be useful when validating multiple package.jsons at the same time
 */
export class AllVersionsTheSame extends ValidationRule {
  public readonly name = 'dependencies/versions-consistent';

  private readonly ourPackages: {[pkg: string]: string} = {};
  private readonly usedDeps: {[pkg: string]: VersionCount[]} = {};

  public prepare(pkg: PackageJson): void {
    this.ourPackages[pkg.json.name] = pkg.json.version;
    this.recordDeps(pkg.json.dependencies);
    this.recordDeps(pkg.json.devDependencies);
  }

  public validate(pkg: PackageJson): void {
    this.validateDeps(pkg, 'dependencies');
    this.validateDeps(pkg, 'devDependencies');
  }

  private recordDeps(deps: {[pkg: string]: string} | undefined) {
    if (!deps) { return; }

    Object.keys(deps).forEach(dep => {
      this.recordDep(dep, deps[dep]);
    });
  }

  private validateDeps(pkg: PackageJson, section: string) {
    if (!pkg.json[section]) { return; }

    Object.keys(pkg.json[section]).forEach(dep => {
      this.validateDep(pkg, section, dep);
    });
  }

  private recordDep(dep: string, version: string) {
    if (version === '*') {
      // '*' does not give us info, so skip
      return;
    }

    if (!(dep in this.usedDeps)) {
      this.usedDeps[dep] = [];
    }

    const i = this.usedDeps[dep].findIndex(vc => vc.version === version);
    if (i === -1) {
      this.usedDeps[dep].push({ version, count: 1 });
    } else {
      this.usedDeps[dep][i].count += 1;
    }
  }

  private validateDep(pkg: PackageJson, depField: string, dep: string) {
    if (dep in this.ourPackages) {
      expectJSON(this.name, pkg, depField + '.' + dep, this.ourPackages[dep]);
      return;
    }

    // Otherwise, must match the majority version declaration. Might be empty if we only
    // have '*', in which case that's fine.
    if (!(dep in this.usedDeps)) { return; }

    const versions = this.usedDeps[dep];
    versions.sort((a, b) => b.count - a.count);
    expectJSON(this.name, pkg, depField + '.' + dep, versions[0].version);
  }
}

export class AwsLint extends ValidationRule {
  public readonly name = 'awslint';

  public validate(pkg: PackageJson) {
    if (!isJSII(pkg)) {
      return;
    }

    expectJSON(this.name, pkg, 'scripts.awslint', 'awslint');
  }
}

export class JestCoverageTarget extends ValidationRule {
  public readonly name = 'jest-coverage-target';

  public validate(pkg: PackageJson) {
    if (pkg.json.jest) {
      // We enforce the key exists, but the value is just a default
      const defaults: { [key: string]: number } = {
        branches: 80,
        statements: 80,
      };
      for (const key of Object.keys(defaults)) {
        const deepPath = ['coverageThreshold', 'global', key];
        const setting = deepGet(pkg.json.jest, deepPath);
        if (setting == null) {
          pkg.report({
            ruleName: this.name,
            message: `When jest is used, jest.coverageThreshold.global.${key} must be set`,
            fix: () => {
              deepSet(pkg.json.jest, deepPath, defaults[key]);
            },
          });
        }
      }
    }
  }
}

/**
 * Packages inside JSII packages (typically used for embedding Lambda handles)
 * must only have dev dependencies and their node_modules must have been
 * blacklisted for publishing
 *
 * We might loosen this at some point but we'll have to bundle all runtime dependencies
 * and we don't have good transitive license checks.
 */
export class PackageInJsiiPackageNoRuntimeDeps extends ValidationRule {
  public readonly name = 'lambda-packages-no-runtime-deps';

  public validate(pkg: PackageJson) {
    if (!isJSII(pkg)) { return; }

    for (const inner of findInnerPackages(pkg.packageRoot)) {
      const innerPkg = PackageJson.fromDirectory(inner);

      if (Object.keys(innerPkg.dependencies).length > 0) {
        pkg.report({
          ruleName: `${this.name}:1`,
          message: `NPM Package '${innerPkg.packageName}' inside jsii package '${pkg.packageName}', can only have devDepencencies`,
        });
      }

      const nodeModulesRelPath = path.relative(pkg.packageRoot, innerPkg.packageRoot) + '/node_modules';
      fileShouldContain(`${this.name}:2`, pkg, '.npmignore', nodeModulesRelPath);
    }
  }
}

/**
 * Requires packages to have fast-fail build scripts, allowing to combine build, test and package in a single command.
 * This involves two targets: `build+test:pack` and `build+test` (to skip the pack).
 */
export class FastFailingBuildScripts extends ValidationRule {
  public readonly name = 'fast-failing-build-scripts';

  public validate(pkg: PackageJson) {
    const scripts = pkg.json.scripts || {};

    const hasTest = 'test' in scripts;
    const hasPack = 'package' in scripts;

    const cmdBuild = 'yarn run build';
    expectJSON(this.name, pkg, 'scripts.build+test', hasTest ? [cmdBuild, 'yarn test'].join(' && ') : cmdBuild);

    const cmdBuildTest = 'yarn run build+test';
    expectJSON(this.name, pkg, 'scripts.build+test+package', hasPack ? [cmdBuildTest, 'yarn run package'].join(' && ') : cmdBuildTest);
  }
}

export class YarnNohoistBundledDependencies extends ValidationRule {
  public readonly name = 'yarn/nohoist-bundled-dependencies';

  public validate(pkg: PackageJson) {
    const bundled: string[] = pkg.json.bundleDependencies || pkg.json.bundledDependencies || [];
    if (bundled.length === 0) { return; }

    const repoPackageJson = path.resolve(__dirname, '../../../package.json');

    const nohoist: string[] = require(repoPackageJson).workspaces.nohoist; // eslint-disable-line @typescript-eslint/no-require-imports

    const missing = new Array<string>();
    for (const dep of bundled) {
      for (const entry of [`${pkg.packageName}/${dep}`, `${pkg.packageName}/${dep}/**`]) {
        if (nohoist.indexOf(entry) >= 0) { continue; }
        missing.push(entry);
      }
    }

    if (missing.length > 0) {
      pkg.report({
        ruleName: this.name,
        message: `Repository-level 'workspaces.nohoist' directive is missing: ${missing.join(', ')}`,
        fix: () => {
          const packageJson = require(repoPackageJson); // eslint-disable-line @typescript-eslint/no-require-imports
          packageJson.workspaces.nohoist = [...packageJson.workspaces.nohoist, ...missing].sort();
          fs.writeFileSync(repoPackageJson, `${JSON.stringify(packageJson, null, 2)}\n`, { encoding: 'utf8' });
        },
      });
    }
  }
}

export class ConstructsDependency extends ValidationRule {
  public readonly name = 'constructs/dependency';

  public validate(pkg: PackageJson) {
    const REQUIRED_VERSION = '^10.0.0';

    if (pkg.devDependencies?.constructs && pkg.devDependencies?.constructs !== REQUIRED_VERSION) {
      pkg.report({
        ruleName: this.name,
        message: `"constructs" must have a version requirement ${REQUIRED_VERSION}`,
        fix: () => {
          pkg.addDevDependency('constructs', REQUIRED_VERSION);
        },
      });
    }

    if (pkg.dependencies.constructs && pkg.dependencies.constructs !== REQUIRED_VERSION) {
      pkg.report({
        ruleName: this.name,
        message: `"constructs" must have a version requirement ${REQUIRED_VERSION}`,
        fix: () => {
          pkg.addDependency('constructs', REQUIRED_VERSION);
        },
      });

      if (!pkg.peerDependencies.constructs || pkg.peerDependencies.constructs !== REQUIRED_VERSION) {
        pkg.report({
          ruleName: this.name,
          message: `"constructs" must have a version requirement ${REQUIRED_VERSION} in peerDependencies`,
          fix: () => {
            pkg.addPeerDependency('constructs', REQUIRED_VERSION);
          },
        });
      }
    }
  }
}

export class EslintSetup extends ValidationRule {
  public readonly name = 'package-info/eslint';

  public validate(pkg: PackageJson) {
    const eslintrcFilename = '.eslintrc.js';
    if (!fs.existsSync(eslintrcFilename)) {
      pkg.report({
        ruleName: this.name,
        message: 'There must be a .eslintrc.js file at the root of the package',
      });
    }
    fileShouldContain(this.name, pkg, '.gitignore', '!.eslintrc.js');
    fileShouldContain(this.name, pkg, '.npmignore', '.eslintrc.js');
  }
}

export class JestSetup extends ValidationRule {
  public readonly name = 'package-info/jest.config';

  public validate(pkg: PackageJson): void {
    const jestConfigFilename = 'jest.config.js';
    if (!fs.existsSync(jestConfigFilename)) {
      pkg.report({
        ruleName: this.name,
        message: 'There must be a jest.config.js file at the root of the package',
      });
    }
    fileShouldContain(this.name, pkg, '.gitignore', '!jest.config.js');
    fileShouldContain(this.name, pkg, '.npmignore', 'jest.config.js');

    if (!(pkg.json.devDependencies ?? {})['@types/jest']) {
      pkg.report({
        ruleName: `${this.name}.types`,
        message: 'There must be a devDependency on \'@types/jest\' if you use jest testing',
      });
    }
  }
}

/**
 * Determine whether this is a JSII package
 *
 * A package is a JSII package if there is 'jsii' section in the package.json
 */
function isJSII(pkg: PackageJson): boolean {
  return (pkg.json.jsii !== undefined);
}

/**
 * Determine whether the package has tests
 *
 * A package has tests if the root/test directory exists
 */
function hasTestDirectory(pkg: PackageJson) {
  return fs.existsSync(path.join(pkg.packageRoot, 'test'));
}
