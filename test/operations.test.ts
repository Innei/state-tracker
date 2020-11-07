import { produce as ES6Produce } from '../src/proxy';

testTracker(true);

function testTracker(useProxy: boolean) {
  const produce = ES6Produce;
  // const produce = useProxy ? ES6Produce : ES5Produce;
  const decorateDesc = (text: string) =>
    useProxy ? `proxy: ${text}` : `es5: ${text}`;

  describe(decorateDesc('Simulate basic operations'), () => {
    /**
     * Because Proxy is not equal with basic object, proxyState always return
     * a Proxy object. when attempt to reuse childProxy, it may cause unexpected result.
     *
     *  if (!childProxyTracker && childProxy) {
     *     childProxyTracker = childProxy[TRACKER];
     *     const childProxyBase = childProxyTracker.getBase();
     *     if (
     *       childProxyBase === value ||
     *       (isObject(value) &&
     *         value.getTracker &&
     *         childProxyBase === value.getTracker().getBase())
     *     ) {
     *       if (tracker._context)
     *         childProxyTracker.setContext(tracker._context);
     *       childProxy.getTracker().setMask(trackerMask);
     *       return childProxy;
     *     }
     *   }
     *
     * In source code, `childProxyBase === value` is not sufficient.
     */
    it('partial update: use proxy state as source data', () => {
      const state = {
        a: {
          a1: [{ value: 0 }, { value: 1 }, { value: 2 }, { value: 3 }],
        },
      };

      const proxyState = produce(state);
      proxyState.strictEnter('list');

      const trackerList = proxyState.a.a1.map((item: any) =>
        item.getTracker().getId()
      );
      proxyState.leave();
      const list = [...proxyState.a.a1];
      list[2] = { ...list[2] };

      proxyState.relink(['a'], { a1: list });
      proxyState.strictEnter('list');

      const nextTrackerList = proxyState.a.a1.map((item: any) =>
        item.getTracker().getId()
      );
      proxyState.leave();

      expect(nextTrackerList[0] === trackerList[0]).toBe(true);
      expect(nextTrackerList[1] === trackerList[1]).toBe(true);
      expect(nextTrackerList[2] === trackerList[2]).toBe(false);
      expect(nextTrackerList[3] === trackerList[3]).toBe(true);
    });

    it('partial update: the correct way', () => {
      const state = {
        a: {
          a1: [{ value: 0 }, { value: 1 }, { value: 2 }, { value: 3 }],
        },
      };

      const proxyState = produce(state);
      proxyState.strictEnter('list');

      const trackerList = proxyState.a.a1.map((item: any) =>
        item.getTracker().getId()
      );
      proxyState.leave();
      const list = [...state.a.a1];
      list[2] = { ...list[2] };

      proxyState.relink(['a'], { a1: list });
      proxyState.strictEnter('list');

      const nextTrackerList = proxyState.a.a1.map((item: any) =>
        item.getTracker().getId()
      );
      proxyState.leave();

      expect(nextTrackerList[0] === trackerList[0]).toBe(true);
      expect(nextTrackerList[1] === trackerList[1]).toBe(true);
      expect(nextTrackerList[2] === trackerList[2]).toBe(false);
      expect(nextTrackerList[3] === trackerList[3]).toBe(true);
    });

    it('remove an item', () => {
      const state = {
        a: {
          a1: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
        },
      };

      const proxyState = produce(state);
      proxyState.strictEnter('list');
      const a = proxyState.peek(['a']);
      const data = a.a1;

      proxyState.strictEnter('item0');
      expect(data[0].id).toBe(0);
      const tracker_0_id = data[0].getTracker().getId();
      proxyState.leave();
      proxyState.strictEnter('item1');
      expect(data[1].id).toBe(1);
      const tracker_1_id = data[1].getTracker().getId();
      proxyState.leave();
      proxyState.strictEnter('item2');
      expect(data[2].id).toBe(2);
      // const tracker_2_id = data[2].getTracker().getId()
      proxyState.leave();
      proxyState.strictEnter('item3');
      expect(data[3].id).toBe(3);
      const tracker_3_id = data[3].getTracker().getId();
      proxyState.leave();
      proxyState.strictEnter('item4');
      expect(data[4].id).toBe(4);
      const tracker_4_id = data[4].getTracker().getId();
      proxyState.leave();

      const newData = state.a.a1.slice();
      newData.splice(2, 1);
      // proxyState.relink(['a'], {
      //   a1: newData,
      // })
      proxyState.a.a1 = newData;

      proxyState.strictEnter('list');
      const nextData = proxyState.peek(['a']).a1;

      proxyState.enter('item0');
      expect(nextData[0].id).toBe(0);
      const tracker_0_id_next = nextData[0].getTracker().getId();
      expect(tracker_0_id_next).toBe(tracker_0_id);
      proxyState.leave();
      proxyState.enter('item1');
      expect(nextData[1].id).toBe(1);
      const tracker_1_id_next = nextData[1].getTracker().getId();
      expect(tracker_1_id_next).toBe(tracker_1_id);
      proxyState.leave();
      proxyState.enter('item2');
      expect(nextData[2].id).toBe(3);
      const tracker_2_id_next = nextData[2].getTracker().getId();
      expect(tracker_2_id_next).toBe(tracker_3_id);
      proxyState.leave();
      proxyState.enter('item3');
      expect(nextData[3].id).toBe(4);
      const tracker_3_id_next = nextData[3].getTracker().getId();
      expect(tracker_3_id_next).toBe(tracker_4_id);
      proxyState.leave();
    });
  });
}