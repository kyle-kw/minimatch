import t from 'tap'
import type { MinimatchOptions } from '../src/index.js'
import { minimatch, Minimatch } from '../src/index.js'

const roots = [
  'C:',
  'c:',
  '//?/C:',
  '//srv/share',
  '//?/UNC/srv/share',
  '//?/unc/srv/share',
]

for (const optimizationLevel of [1, 2]) {
  t.test(`Windows roots at optimization level ${optimizationLevel}`, t => {
    for (const preserveMultipleSlashes of [false, true]) {
      const options: MinimatchOptions = {
        platform: 'win32',
        optimizationLevel,
        preserveMultipleSlashes,
      }

      for (const root of roots) {
        for (const [suffix, expected] of [
          ['..', ''],
          ['foo/../..', ''],
          ['../../..', ''],
          ['foo/../../../x', 'x'],
          ['../foo/../../x', 'x'],
        ]) {
          const pattern = `${root}/${suffix}`
          const file = `${root}/${expected}`
          const m = new Minimatch(pattern, options)
          const parts = root.split('/')
          if (expected) parts.push(expected)
          t.strictSame(m.globParts, [parts], pattern)
          t.equal(m.match(file), true, `${pattern} matches ${file}`)
          t.equal(m.match(`/${expected}`), false, 'keep the root')
          t.equal(m.match(expected), false, 'do not match a relative path')
          t.equal(m.match(`D:/${expected}`), false, 'keep the drive')
          t.equal(
            m.match(`//srv/other/${expected}`),
            false,
            'keep the share',
          )
          t.equal(
            m.match(`//other/share/${expected}`),
            false,
            'keep the server',
          )

          t.equal(
            minimatch(file.replace(/\//g, '\\'), pattern, options),
            true,
            'backslash file separators',
          )
          t.equal(
            minimatch(
              file.replace(/\//g, '\\'),
              pattern.replace(/\//g, '\\'),
              { ...options, windowsPathsNoEscape: true },
            ),
            true,
            'backslash pattern separators',
          )

          if (optimizationLevel === 2) {
            t.strictSame(m.levelTwoFileOptimize(pattern), parts)
            t.equal(m.match(pattern), true, 'optimize both sides')
            t.equal(
              minimatch(pattern, expected ? file : root, options),
              true,
              'optimize a file against a normalized pattern',
            )
          }
        }

        for (const suffix of ['../*', 'foo/../../*', '../**']) {
          const m = new Minimatch(`${root}/${suffix}`, options)
          t.equal(m.match(`${root}/x`), true, 'glob below the root')
          t.equal(m.match('/x'), false, 'glob cannot lose the root')
          t.equal(m.match(`${root}/.x`), false, 'dot option unchanged')
        }
        t.equal(
          minimatch(`${root}/.x`, `${root}/../*`, {
            ...options,
            dot: true,
          }),
          true,
          'dot option below the root',
        )
      }
    }
    t.equal(
      minimatch('C:/', 'C:/foo/../..', { platform: 'win32' }),
      true,
      'the default optimization level also keeps the root',
    )
    t.end()
  })
}

t.test('root normalization preserves case matching options', t => {
  for (const optimizationLevel of [1, 2]) {
    const options: MinimatchOptions = {
      platform: 'win32',
      optimizationLevel,
    }
    t.equal(minimatch('c:/x', 'C:/../x', options), true)
    t.equal(minimatch('//?/c:/x', 'C:/../x', options), true)
    t.equal(minimatch('c:/x', '//?/C:/../x', options), true)
    t.equal(minimatch('C:/X', 'C:/../x', options), false)
    for (const windowsNoMagicRoot of [false, true]) {
      const m = new Minimatch('//srv/share/../X', {
        ...options,
        nocase: true,
        windowsNoMagicRoot,
      })
      t.equal(m.match('//srv/share/x'), true)
      t.equal(m.match('//SRV/SHARE/x'), !windowsNoMagicRoot)
    }
  }
  t.end()
})

t.test('dots, repeated separators, and globstar at a Windows root', t => {
  for (const root of roots) {
    const one = new Minimatch(`${root}/.././x`, {
      platform: 'win32',
      optimizationLevel: 1,
    })
    t.strictSame(one.globParts, [[...root.split('/'), '.', 'x']])
    t.equal(one.match(`${root}/./x`), true)
    t.equal(one.match(`${root}/x`), false, 'level 1 preserves dots')

    const two = new Minimatch(`${root}/./foo//../../../x`, {
      platform: 'win32',
      optimizationLevel: 2,
    })
    t.strictSame(two.globParts, [[...root.split('/'), 'x']])
    t.equal(two.match(`${root}/x`), true)
    t.equal(two.match(`${root}/./foo//../../../x`), true)

    const star = new Minimatch(`${root}/**/../x/y`, {
      platform: 'win32',
      optimizationLevel: 2,
    })
    t.equal(star.match(`${root}/x/y`), true, 'empty globstar')
    t.equal(star.match(`${root}/a/x/y`), true, 'nonempty globstar')
    t.equal(star.match('/x/y'), false, 'globstar keeps the root')
  }
  t.end()
})

t.test('drive-like relative components are not roots', t => {
  for (const optimizationLevel of [1, 2]) {
    const options: MinimatchOptions = {
      platform: 'win32',
      optimizationLevel,
    }
    for (const [pattern, file] of [
      ['a/C:/../x', 'a/x'],
      ['a/../C:/../x', 'x'],
      ['./C:/../x', './x'],
      ['/C:/../x', '/x'],
      ['C:foo/../x', 'x'],
    ]) {
      t.equal(minimatch(file, pattern, options), true, pattern)
      if (optimizationLevel === 2) {
        t.equal(minimatch(pattern, file, options), true, pattern)
      }
    }
  }
  const m = new Minimatch('a/**/../C:/../x/y', {
    platform: 'win32',
    optimizationLevel: 2,
  })
  t.strictSame(m.globParts, [
    ['x', 'y'],
    ['a', '**', 'x', 'y'],
  ])
  t.equal(m.match('x/y'), true, 'globstar alternatives stay relative')
  t.equal(m.match('C:/x/y'), false, 'do not invent a drive root')
  t.end()
})

t.test(
  'trailing and repeated separators are preserved when requested',
  t => {
    for (const root of roots) {
      for (const optimizationLevel of [1, 2]) {
        const options: MinimatchOptions = {
          platform: 'win32',
          optimizationLevel,
        }
        const trailing = new Minimatch(`${root}/foo/../../`, options)
        t.strictSame(trailing.globParts, [[...root.split('/'), '']])
        t.equal(trailing.match(`${root}/`), true)
        t.equal(trailing.match(root), false, 'explicit trailing slash')

        const repeated = new Minimatch(`${root}//foo/../../x`, {
          ...options,
          preserveMultipleSlashes: true,
        })
        t.strictSame(repeated.globParts, [
          [...root.split('/'), '', '..', 'x'],
        ])
        t.equal(repeated.match(`${root}//../x`), true)
        t.equal(repeated.match(`${root}/x`), false)
      }
    }
    t.end()
  },
)

t.test('UNC glob roots and incomplete prefixes', t => {
  for (const optimizationLevel of [1, 2]) {
    const options: MinimatchOptions = {
      platform: 'win32',
      optimizationLevel,
    }
    for (const pattern of ['//*/share/../x', '//srv/*/../x']) {
      const m = new Minimatch(pattern, options)
      t.equal(m.match('//srv/share/x'), true, pattern)
      t.equal(m.match('//srv/x'), false, 'keep the full glob root')
    }
    for (const [pattern, expected] of [
      ['//srv/../x', '//x'],
      ['//./share/../x', optimizationLevel === 1 ? '//./x' : '//x'],
      ['//../share/../x', '//../x'],
      ['//?/UNC/srv/../x', '//?/UNC/x'],
    ]) {
      const m = new Minimatch(pattern, options)
      t.strictSame(m.globParts, [expected.split('/')], pattern)
    }
  }

  for (const [pattern, expected] of [
    [
      '//**/**/../a/b',
      [
        ['', '', '..', 'a', 'b'],
        ['', '', '**', 'a', 'b'],
      ],
    ],
    [
      '//srv/**/../a/b',
      [
        ['', '', 'a', 'b'],
        ['', '', 'srv', '**', 'a', 'b'],
      ],
    ],
  ] as const) {
    const m = new Minimatch(pattern, {
      platform: 'win32',
      optimizationLevel: 2,
    })
    t.strictSame(m.globParts, expected, 'globstars are not UNC roots')
  }
  t.end()
})

t.test('POSIX and level 0 behavior is unchanged', t => {
  for (const optimizationLevel of [1, 2]) {
    const options: MinimatchOptions = {
      platform: 'linux',
      optimizationLevel,
    }
    t.equal(minimatch('/', 'C:/foo/../..', options), true)
    t.equal(minimatch('C:/', 'C:/foo/../..', options), false)
    t.equal(minimatch('//srv/x', '//srv/share/../x', options), true)
    t.equal(
      minimatch('//?/UNC/srv/x', '//?/UNC/srv/share/../x', options),
      true,
    )
  }
  for (const root of roots) {
    const pattern = `${root}/foo/../../x`
    const m = new Minimatch(pattern, {
      platform: 'win32',
      optimizationLevel: 0,
    })
    t.strictSame(m.globParts, [pattern.split('/')])
    t.equal(m.match(pattern), true)
    t.equal(m.match(`${root}/x`), false)
  }
  t.end()
})
