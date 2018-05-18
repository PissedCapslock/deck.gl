// Copyright (c) 2015 - 2017 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import log from '../utils/log';

// TODO - hack for initial PR, remove
const ASYNC_PROPS = {
  data: null
};

const EMPTY_PROPS = Object.freeze({});

export default class ComponentState {
  constructor(component = null) {
    this.component = component;
    this.oldProps = EMPTY_PROPS; // Last props before update
    this.asyncProps = {};
    this.onAsyncPropUpdated = () => {};
  }

  getOldProps() {
    return this.oldProps;
  }

  resetOldProps() {
    this.oldProps = this.component.props;
  }

  //
  // ASYNC PROP HANDLING
  //

  // Checks if a prop is overridden
  hasAsyncProp(propName) {
    return propName in this.asyncProps;
  }

  // Returns value of an overriden prop
  getAsyncProp(propName) {
    const asyncProp = this.asyncProps[propName];
    return asyncProp && asyncProp.resolvedValue;
  }

  isAsyncPropLoading(propName) {
    const asyncProp = this.asyncProps[propName];
    return (
      asyncProp &&
      asyncProp.pendingLoadCount > 0 &&
      asyncProp.pendingLoadCount !== asyncProp.resolvedLoadCount
    );
  }

  // Updates all async/overridden props (when new props come in)
  // Checks if urls have changed, starts loading, or removes override
  setAsyncProps(props) {
    // TODO - use async props from the layer's prop types
    for (const propName in ASYNC_PROPS) {
      // const value = this.layer.props._getOriginalValue(propName)
      if (propName in props) {
        const value = props[propName];
        this._updateAsyncProp(propName, value);
      }
    }
  }

  // Intercept strings (URLs) and Promises and activates loading and prop rewriting
  _updateAsyncProp(propName, value) {
    // Makes sure a record exists for this prop
    this._getAsyncPropData(propName);

    if (!this._didAsyncInputValueChange(propName, value)) {
      return;
    }

    // interpret value string as url and start a new load tracked by a promise
    if (typeof value === 'string') {
      const {fetch} = this.layer.props;
      const url = value;
      value = fetch(url);
    }

    // interprets promise and track the "loading"
    if (value instanceof Promise) {
      this._watchPromise(propName, value);
      return;
    }

    // else, normal, non-async value. Just store value for now
    this._setPropValue(propName, value);
  }

  // Checks if an input value actually changed (to avoid reloading/rewatching promises/urls)
  _didAsyncInputValueChange(propName, value) {
    const asyncProp = this.asyncProps[propName];
    if (value === asyncProp.lastValue) {
      return false;
    }
    asyncProp.lastValue = value;
    return true;
  }

  // Set normal, non-async value
  _setPropValue(propName, value) {
    const asyncProp = this.asyncProps[propName];
    asyncProp.value = value;
    asyncProp.resolvedValue = value;
    asyncProp.pendingLoadCount++;
    asyncProp.resolvedLoadCount = asyncProp.pendingLoadCount;
  }

  // Set a just resolved async value, calling onAsyncPropUpdates if value changes asynchronously
  _setAsyncPropValue(propName, value, loadCount) {
    // Only update if loadCount is larger or equal to resolvedLoadCount
    // otherwise a more recent load has already completed
    const asyncProp = this.asyncProps[propName];
    if (asyncProp && loadCount >= asyncProp.resolvedLoadCount) {
      value = this._postProcessValue(propName, value);
      asyncProp.resolvedValue = value;
      asyncProp.resolvedLoadCount = loadCount;

      // Call callback to inform listener
      this.onAsyncPropUpdated(propName, value);
    }
  }

  // Tracks a promise, sets the prop when loaded, handles load count
  _watchPromise(propName, promise) {
    const asyncProp = this.asyncProps[propName];
    asyncProp.pendingLoadCount++;
    const loadCount = asyncProp.pendingLoadCount;
    promise
      .then(data => this._setAsyncPropValue(propName, data, loadCount))
      .catch(error => log.error(error));
  }

  // Give the app a chance to post process the loaded data
  _postProcessValue(propName, value) {
    const {dataTransform} = this.object ? this.object.props : {};
    if (propName === 'data' && dataTransform) {
      value = dataTransform(value);
    }
    return value;
  }

  // Return a asyncProp, creating it if needed
  _getAsyncPropData(propName, value) {
    const asyncProp = this.asyncProps[propName];
    if (!asyncProp) {
      this.asyncProps[propName] = {
        lastValue: value, // Supplied prop value (can be url/promise, not visible to layer)
        resolvedValue: null, // Resolved prop value (valid data that can be "shown" to layer)
        pendingLoadCount: 0, // How many loads have been issued
        resolvedLoadCount: 0 // Latest resolved load, (earlier loads will be ignored)
      };
    }
    return this.asyncProps[propName];
  }
}
