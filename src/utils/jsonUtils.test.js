import { deepStrictEqual, strictEqual } from 'assert'
import {
  calculatePosition,
  countCharacterOccurrences,
  normalizeJsonParseError
} from './jsonUtils.js'

describe('jsonUtils', () => {
  const jsonString = '{\n' +
    '  id: 2,\n' +
    '  name: "Jo"\n' +
    '}'

  const jsonString2 = '{\n' +
    '  "id": 2,\n' +
    '  name: "Jo"\n' +
    '}'

  it('should normalize an error from Chrome (1)', () => {
    const errorMessage = 'Unexpected token i in JSON at position 4'

    deepStrictEqual(normalizeJsonParseError(jsonString, errorMessage), {
      position: 4,
      line: 1,
      column: 2,
      message: 'Unexpected token i in JSON at line 2 column 3'
    })
  })

  it ('should normalize a parse error from Firefox (1)', () => {
    const errorMessage = 'JSON.parse: expected property name or \'}\' at line 2 column 3 of the JSON data'

    deepStrictEqual(normalizeJsonParseError(jsonString, errorMessage), {
      position: 4,
      line: 1,
      column: 2,
      message: errorMessage
    })
  })

  it('should normalize an error from Chrome (2)', () => {
    const errorMessage = 'Unexpected token n in JSON at position 15'

    deepStrictEqual(normalizeJsonParseError(jsonString2, errorMessage), {
      position: 15,
      line: 2,
      column: 2,
      message: 'Unexpected token n in JSON at line 3 column 3'
    })
  })

  it ('should normalize a parse error from Firefox (2)', () => {
    const errorMessage = 'JSON.parse: expected double-quoted property name at line 3 column 3 of the JSON data'

    deepStrictEqual(normalizeJsonParseError(jsonString2, errorMessage), {
      position: 15,
      line: 2,
      column: 2,
      message: errorMessage
    })
  })

  it ('should calculate the position from a line and column number', () => {
    strictEqual(calculatePosition(jsonString, 1, 2), 4)
    strictEqual(calculatePosition(jsonString2, 2, 2), 15)
  })

  it ('should count occurrences of a specific character in a string', () => {
    strictEqual(countCharacterOccurrences('1\n2\n3\n4\n', '\n'), 4)
    strictEqual(countCharacterOccurrences('1\n2\n3\n4\n', '\n', 0, 2), 1)
    strictEqual(countCharacterOccurrences('1\n2\n3\n4\n', '\n', 0, 3), 1)
    strictEqual(countCharacterOccurrences('1\n2\n3\n4\n', '\n', 5), 2)
    strictEqual(countCharacterOccurrences('1\n2\n3\n4\n', '\n', 6), 1)
  })
})
