import { initial, isEqual } from 'lodash-es'
import {
  ACTIVE_SEARCH_RESULT,
  SEARCH_RESULT,
  STATE_KEYS,
  STATE_SEARCH_PROPERTY,
  STATE_SEARCH_VALUE
} from '../constants.js'
import { existsIn, getIn, setIn } from '../utils/immutabilityHelpers.js'
import { valueType } from '../utils/typeUtils.js'

/**
 * @typedef {Object} SearchResult
 * @property {Object} items
 * @property {Object} itemsWithActive
 * @property {Path[]} flatItems
 * @property {Path} activeItem
 * @property {number} activeIndex
 * @property {number} count
 */

// TODO: comment
export function updateSearchResult (doc, flatResults, previousResult) {
  const flatItems = flatResults

  const items = createRecursiveSearchResults(doc, flatItems)

  const activeItem = (previousResult && previousResult.activeItem &&
    existsIn(items, previousResult.activeItem))
    ? previousResult.activeItem
    : flatItems[0]

  const activeIndex = flatItems.findIndex(item => isEqual(item, activeItem))

  const itemsWithActive = (items && activeItem && activeIndex !== -1)
    ? setIn(items, activeItem, ACTIVE_SEARCH_RESULT)
    : items

  return {
    items,
    itemsWithActive,
    flatItems,
    count: flatItems.length,
    activeItem,
    activeIndex: activeIndex
  }
}

// TODO: comment
export function createRecursiveSearchResults (referenceDoc, flatResults) {
  // TODO: smart update result based on previous results to make the results immutable when there is no actual change
  let result = {}

  flatResults.forEach(path => {
    const parentPath = initial(path)
    if (!existsIn(result, parentPath)) {
      const item = getIn(referenceDoc, parentPath)
      result = setIn(result, parentPath, Array.isArray(item) ? [] : {}, true)
    }

    result = setIn(result, path, SEARCH_RESULT)
  })

  return result
}

/**
 * @param {SearchResult} searchResult
 * @return {SearchResult}
 */
export function searchNext (searchResult) {
  const nextActiveIndex = searchResult.activeIndex < searchResult.flatItems.length - 1
    ? searchResult.activeIndex + 1
    : searchResult.flatItems.length > 0
      ? 0
      : -1

  const nextActiveItem = searchResult.flatItems[nextActiveIndex]

  const itemsWithActive = nextActiveItem
    ? setIn(searchResult.items, nextActiveItem, ACTIVE_SEARCH_RESULT, true)
    : searchResult.items

  return {
    ...searchResult,
    itemsWithActive,
    activeItem: nextActiveItem,
    activeIndex: nextActiveIndex
  }
}

/**
 * @param {SearchResult} searchResult
 * @return {SearchResult}
 */
export function searchPrevious (searchResult) {
  const previousActiveIndex = searchResult.activeIndex > 0
    ? searchResult.activeIndex - 1
    : searchResult.flatItems.length - 1

  const previousActiveItem = searchResult.flatItems[previousActiveIndex]

  const itemsWithActive = previousActiveItem
    ? setIn(searchResult.items, previousActiveItem, ACTIVE_SEARCH_RESULT, true)
    : searchResult.items

  return {
    ...searchResult,
    itemsWithActive,
    activeItem: previousActiveItem,
    activeIndex: previousActiveIndex
  }
}

async function tick () {
  return new Promise(setTimeout)
}

// TODO: comment
export function searchAsync (searchText, doc, state, { onProgress, onDone, maxResults = Infinity, yieldAfterItemCount = 10000 }) {
  // TODO: what is a good value for yieldAfterItemCount? (larger means faster results but also less responsive during search)
  const search = searchGenerator(searchText, doc, state, yieldAfterItemCount)

  // TODO: implement pause after having found x results (like 999)?

  let cancelled = false
  const results = []
  let newResults = false

  async function executeSearch () {
    if (!searchText || searchText === '') {
      onDone(results)
      return
    }

    let next
    do {
      next = search.next()
      if (next.value) {
        if (results.length < maxResults) {
          results.push(next.value) // TODO: make this immutable?
          newResults = true
        } else {
          // max results limit reached
          cancelled = true
          onDone(results)
        }
      } else {
        // time for a small break, give the browser space to do stuff
        if (newResults) {
          newResults = false
          if (onProgress) {
            onProgress(results)
          }
        }

        await tick()
      }

      // eslint-disable-next-line no-unmodified-loop-condition
    } while (!cancelled && !next.done)

    if (next.done) {
      onDone(results)
    } // else: cancelled
  }

  // start searching on the next tick
  setTimeout(executeSearch)

  return {
    cancel: () => {
      cancelled = true
    }
  }
}

// TODO: comment
export function * searchGenerator (searchText, doc, state = undefined, yieldAfterItemCount = undefined) {
  let count = 0

  function * incrementCounter () {
    count++
    if (typeof yieldAfterItemCount === 'number' && count % yieldAfterItemCount === 0) {
      // pause every x items
      yield null
    }
  }

  function * searchRecursiveAsync (searchText, doc, state, path) {
    const type = valueType(doc)

    if (type === 'array') {
      for (let i = 0; i < doc.length; i++) {
        yield * searchRecursiveAsync(searchText, doc[i], state ? state[i] : undefined, path.concat([i]))
      }
    } else if (type === 'object') {
      const keys = state
        ? state[STATE_KEYS]
        : Object.keys(doc)

      for (const key of keys) {
        if (typeof key === 'string' && containsCaseInsensitive(key, searchText)) {
          yield path.concat([key, STATE_SEARCH_PROPERTY])
        }
        yield * incrementCounter()

        yield * searchRecursiveAsync(searchText, doc[key], state ? state[key] : undefined, path.concat([key]))
      }
    } else { // type is a value
      if (containsCaseInsensitive(doc, searchText)) {
        yield path.concat([STATE_SEARCH_VALUE])
      }
      yield * incrementCounter()
    }
  }

  return yield * searchRecursiveAsync(searchText, doc, state, [])
}

/**
 * Do a case insensitive search for a search text in a text
 * @param {String} text
 * @param {String} searchText
 * @return {boolean} Returns true if `search` is found in `text`
 */
export function containsCaseInsensitive (text, searchText) {
  return String(text).toLowerCase().indexOf(searchText.toLowerCase()) !== -1
}
