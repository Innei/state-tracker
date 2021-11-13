import {
  raw,
  each,
  TRACKER,
  isTrackable,
  createHiddenProperty,
  pathEqual,
  shallowCopy,
  IS_PROXY,
} from './commons';
import { createPlainTrackerObject } from './StateTracker';
import { State, IndexType, IStateTracker, ProduceProxyOptions } from './types';
import StateTrackerContext from './StateTrackerContext';
import StateTrackerUtil from './StateTrackerUtil';
import Container from './Container';

export function produceImpl(
  state: State,
  affected?: WeakMap<object, IStateTracker>,
  proxyCache?: WeakMap<object, IStateTracker>
) {
  const container = new Container();
  const stateTrackerContext = new StateTrackerContext({
    proxyCache,
    affected,
    container,
  });

  const proxy = createProxy(state, {
    stateTrackerContext,
    accessPath: [],
    rootPath: [],
  });

  return proxy;
}

export function createProxy(
  state: State,
  options: ProduceProxyOptions
): IStateTracker {
  const {
    parentProxy = null,
    accessPath = [],
    rootPath = [],
    stateTrackerContext,
  } = options || {};
  const copy = shallowCopy(state);
  const outerAccessPath = accessPath;

  function createES5ProxyProperty({
    target,
    prop,
    enumerable = false,
    configurable = false,
  }: {
    target: IStateTracker | State;
    prop: PropertyKey;
    enumerable: boolean;
    configurable: boolean;
  }) {
    const description = {
      enumerable,
      configurable,
      get(this: IStateTracker) {
        const tracker = this[TRACKER];
        const base = raw(tracker._base);
        const nextAccessPath = accessPath.concat(prop as string);
        const isPeeking = tracker._isPeeking;
        const nextValue = base[prop as string];
        const nextChildProxies = tracker._nextChildProxies;

        if (!isPeeking) {
          if (stateTrackerContext.getCurrent()) {
            stateTrackerContext.getCurrent().track({
              target,
              key: prop as string,
              value: nextValue,
              path: outerAccessPath.concat(prop as string),
            });
          }
        }

        if (!isTrackable(nextValue)) return nextValue;

        if (nextChildProxies.has(nextValue))
          return nextChildProxies.get(nextValue);

        const cachedProxy = stateTrackerContext.getCachedProxy(nextValue);
        if (cachedProxy) {
          nextChildProxies.set(nextValue, cachedProxy);
          return cachedProxy;
        }

        let producedChildProxy = null;

        // 被设置了一个trackedValue，这个时候会尽量用这个trackedValue
        if (StateTrackerUtil.hasTracker(nextValue)) {
          const nextValueTracker = StateTrackerUtil.getTracker(nextValue);
          if (pathEqual(nextValue, nextValueTracker._accessPath)) {
            producedChildProxy = nextValue;
          } else {
            producedChildProxy = createProxy(
              // only new value should create new proxy object..
              // Array.isArray(value) ? value.slice() : { ...value },
              shallowCopy(nextValue),
              {
                accessPath: nextAccessPath,
                parentProxy: state as IStateTracker,
                rootPath,
                stateTrackerContext,
              }
            );
          }
        } else {
          producedChildProxy = createProxy(
            // only new value should create new proxy object..
            // Array.isArray(value) ? value.slice() : { ...value },
            nextValue,
            {
              accessPath: nextAccessPath,
              parentProxy: state as IStateTracker,
              rootPath,
              stateTrackerContext,
            }
          );
        }

        stateTrackerContext.setCachedProxy(nextValue, producedChildProxy);
        nextChildProxies.set(nextValue, producedChildProxy);
        return producedChildProxy;
      },
      set(this: IStateTracker, newValue: any) {
        const tracker = this[TRACKER];
        const base = tracker._base;
        const currentValue = base[prop as string];
        const nextChildProxies = tracker._nextChildProxies;

        if (raw(currentValue) === raw(newValue)) return true;

        base[prop as IndexType] = newValue;

        nextChildProxies.delete(currentValue);
        return true;
      },
    };

    Object.defineProperty(target, prop, description);
  }

  const tracker = createPlainTrackerObject({
    base: copy,
    parentProxy,
    accessPath,
    rootPath,
    stateTrackerContext,
    lastUpdateAt: Date.now(),
  });

  each(state as Array<any>, (prop: PropertyKey) => {
    const desc = Object.getOwnPropertyDescriptor(state, prop);
    const enumerable = desc?.enumerable || false;
    const configurable = desc?.configurable || false;

    // to avoid redefine property, such `getTracker`, `enter` etc.
    if (!configurable) return;

    createES5ProxyProperty({
      target: state,
      prop: prop,
      enumerable,
      configurable,
    });
    createHiddenProperty(state, IS_PROXY, true);
  });

  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cant_define_property_object_not_extensible
  // if property value is not extensible, it will cause error. such as a ref value..
  createHiddenProperty(state, TRACKER, tracker);
  createHiddenProperty(state, 'unlink', function(this: IStateTracker) {
    const tracker = this[TRACKER];
    return tracker._base;
  });

  if (Array.isArray(state)) {
    const descriptors = Object.getPrototypeOf([]);
    const keys = Object.getOwnPropertyNames(descriptors);

    const handler = (
      func: Function,
      functionContext: IStateTracker,
      lengthGetter = true
    ) =>
      function(this: IStateTracker) {
        const args = Array.prototype.slice.call(arguments) // eslint-disable-line
        if (lengthGetter) {
          const tracker = this[TRACKER];

          const accessPath = tracker._accessPath;
          const isPeeking = tracker._isPeeking;
          const nextAccessPath = accessPath.concat('length');

          if (!isPeeking) {
            if (stateTrackerContext.getCurrent()) {
              stateTrackerContext.getCurrent().track({
                target: state,
                value: state.length,
                key: 'length',
                path: nextAccessPath,
              });
            }
          }
        }

        return func.apply(functionContext, args);
      };

    keys.forEach(key => {
      const func = descriptors[key];
      if (typeof func === 'function') {
        const notRemarkLengthPropKeys = ['concat', 'copyWith'];
        const remarkLengthPropKeys = [
          'concat',
          'copyWith',
          'fill',
          'find',
          'findIndex',
          'lastIndexOf',
          'pop',
          'push',
          'reverse',
          'shift',
          'unshift',
          'slice',
          'sort',
          'splice',
          'includes',
          'indexOf',
          'join',
          'keys',
          'entries',
          'forEach',
          'filter',
          'flat',
          'flatMap',
          'map',
          'every',
          'some',
          'reduce',
          'reduceRight',
        ];
        if (notRemarkLengthPropKeys.indexOf(key) !== -1) {
          createHiddenProperty(state, key, handler(func, state as any, false));
        } else if (remarkLengthPropKeys.indexOf(key) !== -1) {
          createHiddenProperty(state, key, handler(func, state as any));
        }
      }
    });
  }

  return state as IStateTracker;
}
