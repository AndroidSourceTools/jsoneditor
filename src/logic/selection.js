import { first, initial, isEmpty, isEqual, last } from 'lodash-es'
import { STATE_EXPANDED, STATE_KEYS } from '../constants.js'
import { getIn, setIn } from '../utils/immutabilityHelpers.js'
import {
  compileJSONPointer,
  parseJSONPointerWithArrayIndices
} from '../utils/jsonPointer.js'
import { isObject, isObjectOrArray } from '../utils/typeUtils.js'
import {
  getNextVisiblePath,
  getPreviousVisiblePath,
  getVisibleCaretPositions,
  getVisiblePaths
} from './documentState.js'

export const SELECTION_TYPE = {
  AFTER: 'after',
  INSIDE: 'inside',
  KEY: 'key',
  VALUE: 'value',
  MULTI: 'multi'
}

/**
 * Expand a selection start and end into an array containing all paths
 * between (and including) start and end
 *
 * @param {JSON} doc
 * @param {JSON} state
 * @param {Path} anchorPath
 * @param {Path} focusPath
 * @return {Path[]} paths
 */
export function expandSelection (doc, state, anchorPath, focusPath) {
  if (isEqual(anchorPath, focusPath)) {
    // just a single node
    return [anchorPath]
  } else {
    // multiple nodes
    const sharedPath = findSharedPath(anchorPath, focusPath)

    if (anchorPath.length === sharedPath.length || focusPath.length === sharedPath.length) {
      // a parent and a child, like ['arr', 1] and ['arr']
      return [sharedPath]
    }

    const anchorKey = anchorPath[sharedPath.length]
    const focusKey = focusPath[sharedPath.length]
    const value = getIn(doc, sharedPath)

    if (isObject(value)) {
      const keys = getIn(state, sharedPath.concat(STATE_KEYS))
      const anchorIndex = keys.indexOf(anchorKey)
      const focusIndex = keys.indexOf(focusKey)

      if (anchorIndex !== -1 && focusIndex !== -1) {
        const startIndex = Math.min(anchorIndex, focusIndex)
        const endIndex = Math.max(anchorIndex, focusIndex)
        const paths = []

        for (let i = startIndex; i <= endIndex; i++) {
          paths.push(sharedPath.concat(keys[i]))
        }

        return paths
      }
    }

    if (Array.isArray(value)) {
      const startIndex = Math.min(anchorKey, focusKey)
      const endIndex = Math.max(anchorKey, focusKey)
      const paths = []

      for (let i = startIndex; i <= endIndex; i++) {
        paths.push(sharedPath.concat(i))
      }

      return paths
    }
  }

  throw new Error('Failed to create selection')
}

/**
 * @param {Selection} selection
 * @return {Path} Returns parent path
 */
export function getParentPath (selection) {
  if (selection.type === SELECTION_TYPE.INSIDE) {
    return selection.focusPath
  } else {
    return initial(selection.focusPath)
  }
}

/**
 * @param {Selection} selection
 * @param {Path} path
 * @return boolean
 */
// TODO: write unit test
export function isSelectionInsidePath (selection, path) {
  return (
    pathStartsWith(selection.focusPath, path) &&
    ((selection.focusPath.length > path.length) || selection.type === SELECTION_TYPE.INSIDE)
  )
}

/**
 * @param {JSON} doc
 * @param {JSON} state
 * @param {Selection} selection
 * @param {boolean} [keepAnchorPath=false]
 * @returns {Selection | null}
 */
// TODO: write unit tests
export function getSelectionUp (doc, state, selection, keepAnchorPath = false) {
  const previousPath = getPreviousVisiblePath(doc, state, selection.focusPath)
  const anchorPath = previousPath
  const focusPath = previousPath

  if (previousPath === null) {
    return null
  }

  if (keepAnchorPath) {
    // multi selection
    if (selection.type === SELECTION_TYPE.AFTER || selection.type === SELECTION_TYPE.INSIDE) {
      return createSelection(doc, state, {
        type: SELECTION_TYPE.MULTI,
        anchorPath: selection.anchorPath,
        focusPath: selection.anchorPath
      })
    }

    return createSelection(doc, state, {
      type: SELECTION_TYPE.MULTI,
      anchorPath: selection.anchorPath,
      focusPath
    })
  }

  if (selection.type === SELECTION_TYPE.KEY) {
    const parentPath = initial(previousPath)
    const parent = getIn(doc, parentPath)
    if (Array.isArray(parent) || isEmpty(previousPath)) {
      // switch to value selection: array has no keys, and root object also not
      return { type: SELECTION_TYPE.VALUE, anchorPath, focusPath }
    } else {
      return { type: SELECTION_TYPE.KEY, anchorPath, focusPath }
    }
  }

  if (selection.type === SELECTION_TYPE.VALUE) {
    return { type: SELECTION_TYPE.VALUE, anchorPath, focusPath }
  }

  // multi selection with one entry
  return createSelection(doc, state, {
    type: SELECTION_TYPE.MULTI,
    anchorPath,
    focusPath
  })
}

/**
 * @param {JSON} doc
 * @param {JSON} state
 * @param {Selection} selection
 * @param {boolean} [keepAnchorPath=false]
 * @returns {Selection | null}
 */
// TODO: write unit tests
export function getSelectionDown (doc, state, selection, keepAnchorPath = false) {
  const nextPath = getNextVisiblePath(doc, state, selection.focusPath)
  const anchorPath = nextPath
  const focusPath = nextPath

  if (nextPath === null) {
    return null
  }

  if (keepAnchorPath) {
    // multi selection

    // if the focusPath is an Array or object, we must not step into it but
    // over it, we pass state with this array/object collapsed
    const collapsedState = isObjectOrArray(getIn(doc, selection.focusPath))
      ? setIn(state, selection.focusPath.concat(STATE_EXPANDED), false, true)
      : state

    const nextPathAfter = getNextVisiblePath(doc, collapsedState, selection.focusPath)

    if (nextPathAfter === null) {
      return null
    }

    if (selection.type === SELECTION_TYPE.AFTER) {
      return createSelection(doc, state, {
        type: SELECTION_TYPE.MULTI,
        anchorPath: nextPathAfter,
        focusPath: nextPathAfter
      })
    }

    if (selection.type === SELECTION_TYPE.INSIDE) {
      return createSelection(doc, state, {
        type: SELECTION_TYPE.MULTI,
        anchorPath,
        focusPath
      })
    }

    return createSelection(doc, state, {
      type: SELECTION_TYPE.MULTI,
      anchorPath: selection.anchorPath,
      focusPath: nextPathAfter
    })
  }

  if (selection.type === SELECTION_TYPE.KEY) {
    const parentPath = initial(nextPath)
    const parent = getIn(doc, parentPath)
    if (Array.isArray(parent)) {
      // switch to value selection: array has no keys
      return { type: SELECTION_TYPE.VALUE, anchorPath, focusPath }
    } else {
      return { type: SELECTION_TYPE.KEY, anchorPath, focusPath }
    }
  }

  if (selection.type === SELECTION_TYPE.VALUE) {
    return { type: SELECTION_TYPE.VALUE, anchorPath, focusPath }
  }

  // multi selection with one entry
  return createSelection(doc, state, {
    type: SELECTION_TYPE.MULTI,
    anchorPath,
    focusPath
  })
}

/**
 * Find the caret position and its siblings for a given selection
 * @param {JSON} doc
 * @param {JSON} state
 * @param {Selection} selection
 * @returns {{next: (CaretPosition|null), caret: (CaretPosition|null), previous: (CaretPosition|null)}}
 */
// TODO: unit test
export function findCaretAndSiblings (doc, state, selection) {
  const visibleCaretPositions = getVisibleCaretPositions(doc, state)

  const index = visibleCaretPositions.findIndex(caret => {
    return isEqual(caret.path, selection.focusPath) && caret.type === selection.type
  })

  return {
    caret: (index !== -1)
      ? visibleCaretPositions[index]
      : null,

    previous: (index !== -1 && index > 0)
      ? visibleCaretPositions[index - 1]
      : null,

    next: (index !== -1 && index < visibleCaretPositions.length - 1)
      ? visibleCaretPositions[index + 1]
      : null
  }
}

/**
 * @param {JSON} doc
 * @param {JSON} state
 * @param {Selection} selection
 * @param {boolean} [keepAnchorPath=false]
 * @returns {Selection | null}
 */
export function getSelectionLeft (doc, state, selection, keepAnchorPath = false) {
  const { caret, previous } = findCaretAndSiblings(doc, state, selection)

  if (keepAnchorPath) {
    if (selection.type !== SELECTION_TYPE.MULTI) {
      return createSelection(doc, state, {
        type: SELECTION_TYPE.MULTI,
        anchorPath: selection.anchorPath,
        focusPath: selection.focusPath
      })
    }

    return null
  }

  if (caret && previous) {
    return createSelection(doc, state, {
      type: previous.type,
      path: previous.path
    })
  }

  const parentPath = initial(selection.focusPath)
  const parent = getIn(doc, parentPath)

  if (selection.type === SELECTION_TYPE.VALUE && Array.isArray(parent)) {
    return createSelection(doc, state, {
      type: SELECTION_TYPE.MULTI,
      anchorPath: selection.focusPath,
      focusPath: selection.focusPath
    })
  }

  if (selection.type === SELECTION_TYPE.MULTI && !Array.isArray(parent)) {
    return createSelection(doc, state, {
      type: SELECTION_TYPE.KEY,
      path: selection.focusPath
    })
  }

  return null
}

/**
 * @param {JSON} doc
 * @param {JSON} state
 * @param {Selection} selection
 * @param {boolean} [keepAnchorPath=false]
 * @returns {Selection | null}
 */
export function getSelectionRight (doc, state, selection, keepAnchorPath = false) {
  const { caret, next } = findCaretAndSiblings(doc, state, selection)

  if (keepAnchorPath) {
    if (selection.type !== SELECTION_TYPE.MULTI) {
      return createSelection(doc, state, {
        type: SELECTION_TYPE.MULTI,
        anchorPath: selection.anchorPath,
        focusPath: selection.focusPath
      })
    }

    return null
  }

  if (caret && next) {
    return createSelection(doc, state, {
      type: next.type,
      path: next.path
    })
  }

  if (selection.type === SELECTION_TYPE.MULTI) {
    return createSelection(doc, state, {
      type: SELECTION_TYPE.VALUE,
      path: selection.focusPath
    })
  }

  return null
}

/**
 * Get a proper initial selection based on what is visible
 * @param {JSON} doc
 * @param {JSON} state
 * @returns {Selection}
 */
export function getInitialSelection (doc, state) {
  const visiblePaths = getVisiblePaths(doc, state)

  // find the first, deepest nested entry (normally a value, not an Object/Array)
  let index = 0
  while (index < visiblePaths.length - 1 && visiblePaths[index + 1].length > visiblePaths[index].length) {
    index++
  }

  const path = visiblePaths[index]
  return (path.length === 0 || Array.isArray(getIn(doc, initial(path))))
    ? { type: SELECTION_TYPE.VALUE, anchorPath: path, focusPath: path } // Array items and root object/array do not have a key, so select value in that case
    : { type: SELECTION_TYPE.KEY, anchorPath: path, focusPath: path }
}

/**
 * @param {JSON} doc
 * @param {JSONPatchDocument} operations
 * @returns {MultiSelection}
 */
// TODO: write unit tests
export function createSelectionFromOperations (doc, operations) {
  // FIXME: handle rename key (move) -> SELECTION_TYPE.KEY
  // FIXME: handle replace value -> SELECTION_TYPE.VALUE

  const paths = operations
    .filter(operation => {
      return (
        operation.op === 'add' ||
        operation.op === 'copy' ||
        operation.op === 'rename' ||
        operation.op === 'replace'
      )
    })
    .map(operation => parseJSONPointerWithArrayIndices(doc, operation.path))

  // TODO: make this function robust against operations which do not have consecutive paths

  return {
    type: SELECTION_TYPE.MULTI,
    paths,
    anchorPath: first(paths),
    focusPath: last(paths),
    pathsMap: createPathsMap(paths)
  }
}

/**
 * @param {Path[]} paths
 * @returns {Object}
 */
// TODO: write unit tests
export function createPathsMap (paths) {
  const pathsMap = {}

  paths.forEach(path => {
    pathsMap[compileJSONPointer(path)] = true
  })

  return pathsMap
}

/**
 * Find the common path of two paths.
 * For example findCommonRoot(['arr', '1', 'name'], ['arr', '1', 'address', 'contact']) returns ['arr', '1']
 * @param {Path} path1
 * @param {Path} path2
 * @return {Path}
 */
// TODO: write unit tests for findSharedPath
export function findSharedPath (path1, path2) {
  let i = 0
  while (i < path1.length && path1[i] === path2[i]) {
    i++
  }

  return path1.slice(0, i)
}

/**
 * @param {Selection} selection
 * @return {Path}
 */
export function findRootPath (selection) {
  return selection.type === SELECTION_TYPE.MULTI && selection.paths.length > 1
    ? initial(selection.focusPath) // the parent path of the paths
    : selection.focusPath
}

/**
 * @param {Path} path
 * @param {Path} parentPath
 * @return boolean
 */
// TODO: unit test
export function pathStartsWith (path, parentPath) {
  if (path.length < parentPath.length) {
    return false
  }

  for (let i = 0; i < parentPath.length; i++) {
    if (path[i] !== parentPath[i]) {
      return false
    }
  }

  return true
}

/**
 * @param {Selection} selection
 * @return {Selection}
 */
// TODO: write unit tests
export function removeEditModeFromSelection (selection) {
  if (selection && selection.edit) {
    return {
      ...selection,
      edit: false
    }
  } else {
    return selection
  }
}

/**
 * @param {JSON} doc
 * @param {JSON} state
 * @param {SelectionSchema} selectionSchema
 * @return {Selection}
 */
// TODO: write unit tests
export function createSelection (doc, state, selectionSchema) {
  // TODO: remove next from SelectionSchema, pass it as a separate argument
  const { type, anchorPath, focusPath, path, edit = false, next = false } = selectionSchema

  if (type === SELECTION_TYPE.KEY) {
    let selection = {
      type,
      anchorPath: path,
      focusPath: path,
      edit
    }
    if (next) {
      selection = {
        ...selection,
        type: SELECTION_TYPE.VALUE
      }
    }
    return selection
  } else if (type === SELECTION_TYPE.VALUE) {
    let selection = {
      type: SELECTION_TYPE.VALUE,
      anchorPath: path,
      focusPath: path,
      edit
    }
    if (next) {
      selection = getSelectionDown(doc, state, selection)
    }
    return selection
  } else if (type === SELECTION_TYPE.AFTER) {
    return {
      type,
      anchorPath: path,
      focusPath: path
    }
  } else if (type === SELECTION_TYPE.INSIDE) {
    return {
      type,
      anchorPath: path,
      focusPath: path
    }
  } else if (anchorPath && focusPath) {
    const paths = expandSelection(doc, state, anchorPath, focusPath)

    // the original anchorPath or focusPath may be somewhere inside the
    // returned paths: when one of the two paths is inside an object and the
    // other is outside. Then the selection is enlarged to span the whole object.
    const focusPathLast = isEqual(focusPath, last(paths)) || isEqual(anchorPath, first(paths))

    return {
      type: SELECTION_TYPE.MULTI,
      anchorPath: focusPathLast ? first(paths) : last(paths),
      focusPath: focusPathLast ? last(paths) : first(paths),
      paths,
      pathsMap: createPathsMap(paths)
    }
  } else {
    throw new TypeError(`Unknown type of selection ${JSON.stringify(selectionSchema)}`)
  }
}

/**
 * Turn selected contents into plain text partial JSON, usable for copying to
 * clipboard for example.
 * @param {JSON} doc
 * @param {Selection} selection
 * @param {number} [indentation=2]
 * @returns {string | null}
 */
export function selectionToPartialJson (doc, selection, indentation = 2) {
  if (selection.type === SELECTION_TYPE.KEY) {
    return JSON.stringify(last(selection.focusPath))
  }

  if (selection.type === SELECTION_TYPE.VALUE) {
    const value = getIn(doc, selection.focusPath)
    return JSON.stringify(value, null, indentation) // TODO: customizable indentation?
  }

  if (selection.type === SELECTION_TYPE.MULTI) {
    const parentPath = getParentPath(selection)
    const parent = getIn(doc, parentPath)
    if (Array.isArray(parent)) {
      if (selection.paths.length === 1) {
        // do not suffix a single selected array item with a comma
        const item = getIn(doc, first(selection.paths))
        return JSON.stringify(item, null, indentation)
      } else {
        return selection.paths.map(path => {
          const item = getIn(doc, path)
          return `${JSON.stringify(item, null, indentation)},`
        }).join('\n')
      }
    } else {
      // parent is Object
      return selection.paths.map(path => {
        const key = last(path)
        const value = getIn(doc, path)
        return `${JSON.stringify(key)}: ${JSON.stringify(value, null, indentation)},`
      }).join('\n')
    }
  }

  return null
}

/**
 * Create a selection which selects the whole document
 * @returns {Selection}
 */
// TODO: write tests
export function selectAll () {
  return {
    type: SELECTION_TYPE.VALUE,
    anchorPath: [],
    focusPath: []
  }
}
